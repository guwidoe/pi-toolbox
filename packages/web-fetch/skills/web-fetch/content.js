#!/usr/bin/env node

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const input = process.argv[2];
const noFallback = process.argv.includes("--no-fallback");

if (!input) {
	console.log("Usage: content.js <url> [--no-fallback]");
	console.log("\nExtracts readable content from a webpage as markdown.");
	console.log("If the fetch fails, automatically falls back to a web search.");
	console.log("Use --no-fallback to disable the search fallback.");
	console.log("\nExamples:");
	console.log("  content.js https://example.com/article");
	console.log("  content.js https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html");
	process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// Build a search query from a URL: use path segments + domain as keywords
function urlToSearchQuery(url) {
	try {
		const u = new URL(url);
		const path = u.pathname
			.replace(/\.[a-z]+$/, "")       // strip file extensions
			.replace(/[/_-]+/g, " ")         // separators to spaces
			.trim();
		const domain = u.hostname.replace(/^www\./, "");
		const parts = [path, domain].filter(Boolean).join(" ").trim();
		return parts || url;
	} catch {
		return url;
	}
}

function fallbackSearch(url) {
	const query = urlToSearchQuery(url);
	console.error(`Fetch failed — falling back to web search for: ${query}\n`);
	try {
		const out = execFileSync(
			process.execPath,
			[join(__dirname, "search.js"), query, "-n", "5", "--content"],
			{ encoding: "utf-8", timeout: 60000, stdio: ["pipe", "pipe", "inherit"] },
		);
		console.log(out);
	} catch (e) {
		console.error(`Search fallback also failed: ${e.message}`);
		process.exit(1);
	}
}

let fetchFailed = false;

// Try Cloudflare "Markdown for Agents" first: request text/markdown with no
// compression (Node's undici has issues decompressing non-HTML content types).
// If the server supports it, we get clean markdown and skip all HTML parsing.
try {
	const mdResponse = await fetch(input, {
		headers: {
			"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "text/markdown",
			"Accept-Encoding": "identity",
			"Accept-Language": "en-US,en;q=0.9",
		},
		signal: AbortSignal.timeout(10000),
	});
	const mdContentType = mdResponse.headers.get("content-type") || "";
	if (mdResponse.ok && mdContentType.includes("text/markdown")) {
		const md = await mdResponse.text();
		if (md.length > 100) {
			console.log(md.trim());
			process.exit(0);
		}
	}
} catch {
	// Markdown negotiation failed — fall through to HTML pipeline.
}

try {
	const response = await fetch(input, {
		headers: {
			"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
		},
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		console.error(`HTTP ${response.status}: ${response.statusText}`);
		fetchFailed = true;
	}

	if (!fetchFailed) {
		const html = await response.text();
		const dom = new JSDOM(html, { url: input });
		const reader = new Readability(dom.window.document);
		const article = reader.parse();

		if (article && article.content) {
			if (article.title) {
				console.log(`# ${article.title}\n`);
			}
			console.log(htmlToMarkdown(article.content));
			process.exit(0);
		}

		// Fallback: try to extract main content
		const fallbackDoc = new JSDOM(html, { url: input });
		const body = fallbackDoc.window.document;
		body.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());

		const title = body.querySelector("title")?.textContent?.trim();
		const main = body.querySelector("main, article, [role='main'], .content, #content") || body.body;

		if (title) {
			console.log(`# ${title}\n`);
		}

		const text = main?.innerHTML || "";
		if (text.trim().length > 100) {
			console.log(htmlToMarkdown(text));
			process.exit(0);
		}

		console.error("Could not extract readable content from this page.");
		fetchFailed = true;
	}
} catch (e) {
	console.error(`Error: ${e.message}`);
	fetchFailed = true;
}

if (fetchFailed && !noFallback) {
	fallbackSearch(input);
} else if (fetchFailed) {
	process.exit(1);
}
