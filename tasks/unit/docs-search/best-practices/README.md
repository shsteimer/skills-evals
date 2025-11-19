# Docs Search - Best Practices

Tests if agent can find and apply best practices from AEM documentation.

**Focus:**
- Agent must search for best practices (not standard patterns)
- Find recommendations from blogs and documentation
- Identify authoritative sources
- Distinguish between best practices and basic usage

**Isolates:** docs-search skill - researching recommended approaches and patterns

---

## Scenario: Security Best Practices for Edge Delivery Services

A customer is preparing to launch their Edge Delivery Services site and has questions about security best practices they should implement.

### Expected Agent Behavior

1. **Invoke docs-search skill** when asked about security best practices
2. **Search for relevant documentation** using appropriate keywords (e.g., "security best practices", "CSP", "security overview")
3. **Find and synthesize information** from multiple authoritative sources
4. **Provide comprehensive guidance** covering multiple security aspects

### Key Documentation to Find

The agent should discover these primary resources:

- **Content Security Policy (CSP)** - `/docs/csp-strict-dynamic-cached-nonce`
  - Recommended CSP configuration: `script-src 'nonce-aem' 'strict-dynamic'; base-uri 'self'; object-src 'none'`
  - CSP as last line of defense vs. primary security measure

- **Security Overview** - `/docs/security`
  - Transport security (TLS/HSTS enforcement)
  - Data protection (encryption at rest/in transit)
  - Attack prevention (WAF, rate limiting)

- **Go-Live Checklist** - `/docs/go-live-checklist`
  - Security considerations before launch
  - Best practices summary

### Example User Questions

- "What security best practices should I follow for my Edge Delivery site?"
- "How should I configure Content Security Policy for AEM?"
- "What security features does Edge Delivery Services provide out of the box?"
- "I'm launching my site next week - what security checklist should I follow?"

### Success Criteria

✅ Agent invokes docs-search skill (not just web search)
✅ Agent finds at least 2-3 relevant security documentation pages
✅ Agent synthesizes information from multiple sources
✅ Agent distinguishes between built-in security vs. configuration needed
✅ Agent provides actionable recommendations (not just generic advice)
✅ Agent includes specific CSP configuration recommendation

### Common Issues Observed

Based on empirical evaluation runs, watch for these issues:

**EDS-Specific Misunderstandings:**
- Treating npm dependencies as a runtime security concern (they're dev-only in EDS, no build step)
- Applying general web dev practices that don't apply to no-build architecture

**Interpretation Issues:**
- Misreading go-live checklist validation items as implementation tasks
  - Example: "Make sure canonical URLs return 2xx" → incorrectly becomes "Implement canonical URLs"
  - Canonical URLs are on by default, this is a verification step not implementation

**Context/Clarity:**
- Vague recommendations without explaining when/where they apply
  - Example: "Add IP X.X.X.X for backend filtering" without explaining what backend or when this is needed
  
**Good Patterns:**
- Well-organized sections covering different security aspects
- Specific commands/code that users can run
- Clear distinction between pre-launch and post-launch actions
- Documentation links for deeper implementation details
