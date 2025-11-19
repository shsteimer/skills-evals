# Docs Search - Feature Documentation

Tests if agent can use docs-search skill to find and explain AEM features.

**Focus:**
- Agent must invoke docs-search skill (info not available in codebase)
- Search for specific feature documentation on aem.live
- Synthesize information from multiple sources
- Provide accurate, complete explanation

**Isolates:** docs-search skill - finding and understanding feature documentation

---

## Scenario: Setting Up Multilingual Sitemaps with hreflang

A developer needs to implement multilingual support for their Edge Delivery site, including proper sitemap configuration with hreflang tags for SEO.

### Expected Agent Behavior

1. **Invoke docs-search skill** when asked about multilingual sitemaps
2. **Search using relevant keywords** (e.g., "multilingual sitemaps", "hreflang", "internationalization", "localization")
3. **Discover multiple related resources** (docs, blog posts)
4. **Explain the complete implementation** including:
   - How sitemaps work in Edge Delivery
   - How to configure hreflang for multilingual sites
   - Best practices for content structure
   - Relationship between indexes, placeholders, and sitemaps

### Key Documentation to Find

The agent should discover these resources:

- **Sitemaps** - `/developer/sitemap`
  - Three types of sitemaps (automatic, query-based, manual)
  - How to configure sitemap generation
  - Sitemap structure and format

- **Translation and Localization** - `/docs/translation-and-localization`
  - HREFLang support in sitemaps
  - XML sitemap structure with alternate language tags
  - Managing i18n and l10n

- **Multilingual Sites Blog** - `/blog/future-proof-multilingual-website-edge-ensemble`
  - Multiple sitemaps support
  - Sitemap per language subfolder
  - Integration with indexes and placeholders
  - Content structuring best practices

- **Go-Live Checklist** - `/docs/go-live-checklist` (supporting info)
  - SEO considerations for multilingual sites
  - Preventing duplicate content issues

### Example User Questions

- "How do I set up sitemaps for a multilingual site in Edge Delivery Services?"
- "I need to add hreflang tags to my sitemap for SEO - how does that work in AEM?"
- "What's the best way to structure content for a site with English, Spanish, and French versions?"
- "Can Edge Delivery Services generate separate sitemaps for each language?"

### Success Criteria

✅ Agent invokes docs-search skill
✅ Agent finds primary sitemap documentation
✅ Agent finds translation/localization documentation
✅ Agent discovers the multilingual blog post for comprehensive guidance
✅ Agent explains the relationship between indexes, sitemaps, and hreflang
✅ Agent provides concrete implementation steps
✅ Agent mentions content structure recommendations (language subfolders)
✅ Agent explains SEO benefits of proper hreflang configuration

### Common Issues Observed

Based on empirical evaluation runs, watch for these issues:

**Missing Critical Prerequisites:**
- Providing YAML config without linking to indexing documentation
  - Users need to create `query-index.json` files but guidance doesn't explain how
  - Should link to `/developer/indexing` docs as a prerequisite
  
**Incomplete Deployment Context:**
- Only mentioning "commit to repo" without explaining config service option
  - Config service is the preferred method for most production sites
  - Should mention both: config service (preferred) and repo-based (for dev/simple cases)
  - Example: "Add helix-sitemap.yaml at repo root (or via Configuration Service)"

**Process Violations:**
- Not reading/fetching the actual documentation after search
  - Some agents provide plausible YAML without actually reading the docs
  - Check that WebFetch/curl was used to read full pages, not just search results

**Good Patterns:**
- Concrete YAML examples tailored to the user's specific scenario (EN/ES/FR)
- Explanation of both configuration AND how it works (query indexes → sitemaps → hreflang)
- Links to all prerequisite/related documentation
- Clear deployment steps with multiple options
- Well-organized sections (config, how it works, prerequisites, deployment)
