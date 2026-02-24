#!/usr/bin/env node

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// --- Argument parsing ---

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
	console.log("\nOptions:");
	console.log("  -n <num>              Number of results (default: 5)");
	console.log("  --content             Fetch and include page content as markdown");
	console.log("  --region <code>       DuckDuckGo region code, e.g. us-en, de-de, uk-en");
	console.log("  --freshness <period>  Filter by time: d (day), w (week), m (month), y (year)");
	console.log("\nExamples:");
	console.log('  search.js "javascript async await"');
	console.log('  search.js "rust programming" -n 10');
	console.log('  search.js "climate change" --content');
	console.log('  search.js "news today" --freshness d');
	console.log('  search.js "recipe" --region de-de');
	process.exit(1);
}

// --- DuckDuckGo HTML scraping ---

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

	if (!response.ok) {
		throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
	}

	const html = await response.text();

	// Detect bot/rate-limit block
	if (html.includes("botnet") || html.includes("anomaly-modal") || html.includes("bots use DuckDuckGo")) {
		throw new Error(
			"DuckDuckGo bot detection triggered (too many requests from this IP).\n" +
			"This is temporary — wait a few minutes and try again.\n" +
			"For heavy use, consider the brave-search skill with a free API key."
		);
	}

	const dom = new JSDOM(html);
	const doc = dom.window.document;
	const results = [];

	const resultDivs = doc.querySelectorAll(".result");

	for (const div of resultDivs) {
		if (results.length >= numResults) break;

		const titleEl = div.querySelector(".result__a");
		const snippetEl = div.querySelector(".result__snippet");
		const urlEl = div.querySelector(".result__url");

		if (!titleEl) continue;

		let href = titleEl.getAttribute("href") || "";
		// DDG sometimes wraps URLs in a redirect; extract the real URL
		if (href.startsWith("//duckduckgo.com/l/?uddg=")) {
			try {
				const parsed = new URL("https:" + href);
				href = decodeURIComponent(parsed.searchParams.get("uddg") || href);
			} catch {
				// keep original
			}
		}

		// Extract date if present (in a <span> inside result__extras__url)
		let date = "";
		const dateSpan = div.querySelector(".result__extras__url span");
		if (dateSpan) {
			const raw = dateSpan.textContent.trim();
			const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
			if (match) date = match[1];
		}

		const title = titleEl.textContent.trim();
		const snippet = snippetEl ? snippetEl.textContent.trim() : "";

		// Skip ads (DDG ad redirects)
		if (!href || href.includes("duckduckgo.com/y.js")) continue;

		if (title && href) {
			results.push({ title, link: href, snippet, date });
		}
	}

	return results;
}

// --- Content extraction (shared with content.js) ---

function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});
	return turndown
		.turndown(html)
		.replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "")
		.replace(/ +/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/\s+\./g, ".")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

async function fetchPageContent(url) {
	// Try Cloudflare "Markdown for Agents" first: request text/markdown with no
	// compression (Node's undici has issues decompressing non-HTML content types).
	try {
		const mdResponse = await fetch(url, {
			headers: {
				"User-Agent": UA,
				"Accept": "text/markdown",
				"Accept-Encoding": "identity",
				"Accept-Language": "en-US,en;q=0.9",
			},
			signal: AbortSignal.timeout(10000),
		});
		const mdContentType = mdResponse.headers.get("content-type") || "";
		if (mdResponse.ok && mdContentType.includes("text/markdown")) {
			const md = (await mdResponse.text()).trim();
			if (md.length > 100) return md.substring(0, 8000);
		}
	} catch {
		// Markdown negotiation failed — fall through to HTML pipeline.
	}

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

		if (article && article.content) {
			return htmlToMarkdown(article.content).substring(0, 8000);
		}

		// Fallback: extract main content area
		const fallbackDoc = new JSDOM(html, { url });
		const body = fallbackDoc.window.document;
		body.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());
		const main = body.querySelector("main, article, [role='main'], .content, #content") || body.body;
		const text = main?.textContent || "";

		if (text.trim().length > 100) {
			return text.trim().substring(0, 8000);
		}

		return "(Could not extract content)";
	} catch (e) {
		return `(Error: ${e.message})`;
	}
}

// --- Main ---

try {
	const results = await searchDDG(query, numResults, region, freshness);

	if (results.length === 0) {
		console.error("No results found.");
		process.exit(0);
	}

	if (fetchContent) {
		const contentPromises = results.map(async (result) => {
			result.content = await fetchPageContent(result.link);
		});
		await Promise.all(contentPromises);
	}

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		console.log(`--- Result ${i + 1} ---`);
		console.log(`Title: ${r.title}`);
		console.log(`Link: ${r.link}`);
		if (r.date) console.log(`Date: ${r.date}`);
		console.log(`Snippet: ${r.snippet}`);
		if (r.content) {
			console.log(`Content:\n${r.content}`);
		}
		console.log("");
	}
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
