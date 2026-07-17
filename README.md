# 5th Marine Command Hub

Website for the 5th Marine Discord mil-sim community. Static HTML/CSS/JS, hosted free on Cloudflare Pages.

**New here?** See [GUIDE.md](GUIDE.md) for a full beginner walkthrough: local preview, editing the roster, and deploying to Cloudflare.

## Pages
- `index.html` — home page
- `chain-of-command.html` — Regiment → Battalion → Company org chart, plus standalone Warrant Officer and Reserves rosters. Content is driven entirely by [`data/chain-of-command.json`](data/chain-of-command.json).

## Quick start
```
python -m http.server 8080
```
Then open http://localhost:8080
