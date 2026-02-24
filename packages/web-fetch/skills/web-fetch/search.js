#!/usr/bin/env node

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const args = process.argv.slice(2);

const contentIndex = args.indexOf("--content");
const fetchContent = contentIndex !== -1;
if (fetchContent) args.splice(contentIndex, 1);

let numResults = 5;
const nIndex = args.indexOf("-n");
if (nIndex !== -1 && args[nIndex + 1]) {
	numResults = parseInt(args[nIndex + 1], 10);
	args.splice(nIndex, 2);
}

let region = "";
const regionIndex = args.indexOf("--region");
if (regionIndex !== -1 && args[regionIndex + 1]) {
	region = args[regionIndex + 1];
	args.splice(regionIndex, 2);
}

let freshness = "";
const freshnessIndex = args.indexOf("--freshness");
if (freshnessIndex !== -1 && args[freshnessIndex + 1]) {
	freshness = args[freshnessIndex + 1];
	args.splice(freshnessIndex, 2);
}

const query = args.join(" ");

if (!query) {
	console.log("Usage: search.js <query> [-n <num>] [--content] [--region <code>] [--freshness <period>]");
	process.exit(1);
}

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function searchDDG(query, numResults, region, freshness) {
	const body = new URLSearchParams({ q: query });
	if (region) body.append("kl", region);
	if (freshness) body.append("df", freshness);

	const response = await fetch("https://html.duckduckgo.com/html/", {
		method: "POST",
		headers: {
			"User-Agent": UA,
			"Content-Type": "application/x-www-form-urlencoded",
			"Accept": "text/html",
			"Accept-Language": "en-US,en;q=0.9",
		},
		body: body.toString(),
	});

	if (!response.ok) throw new Error(`DuckDuckGo returned HTTP ${response.status}`);

	const html = await response.text();
	if (html.includes("botnet") || html.includes("anomaly-modal") || html.includes("bots use DuckDuckGo")) {
		throw new Error("DuckDuckGo bot detection triggered (too many requests from this IP)");
	}

	const dom = new JSDOM(html);
	const doc = dom.window.document;
	const results = [];

	for (const div of doc.querySelectorAll(".result")) {
		if (results.length >= numResults) break;
		const titleEl = div.querySelector(".result__a");
		const snippetEl = div.querySelector(".result__snippet");
		if (!titleEl) continue;

		let href = titleEl.getAttribute("href") || "";
		if (href.startsWith("//duckduckgo.com/l/?uddg=")) {
			try {
				const parsed = new URL("https:" + href);
				href = decodeURIComponent(parsed.searchParams.get("uddg") || href);
			} catch {
				// ignore
			}
		}

		if (!href || href.includes("duckduckgo.com/y.js")) continue;

		results.push({
			title: titleEl.textContent.trim(),
			link: href,
			snippet: snippetEl ? snippetEl.textContent.trim() : "",
		});
	}

	return results;
}

function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});
	return turndown.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
}

async function fetchPageContent(url) {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": UA,
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
			},
			signal: AbortSignal.timeout(15000),
		});

		if (!response.ok) return `(HTTP ${response.status})`;

		const html = await response.text();
		const dom = new JSDOM(html, { url });
		const reader = new Readability(dom.window.document);
		const article = reader.parse();

		if (article?.content) return htmlToMarkdown(article.content).substring(0, 8000);
		return "(Could not extract content)";
	} catch (e) {
		return `(Error: ${e.message})`;
	}
}

try {
	const results = await searchDDG(query, numResults, region, freshness);
	if (results.length === 0) {
		console.error("No results found.");
		process.exit(0);
	}

	if (fetchContent) {
		await Promise.all(results.map(async (result) => {
			result.content = await fetchPageContent(result.link);
		}));
	}

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		console.log(`--- Result ${i + 1} ---`);
		console.log(`Title: ${r.title}`);
		console.log(`Link: ${r.link}`);
		console.log(`Snippet: ${r.snippet}`);
		if (r.content) console.log(`Content:\n${r.content}`);
		console.log("");
	}
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
