# Create Simple Quote Block Test

## Purpose

This unit test evaluates the agent's ability to create a simple block following AEM best practices using the `content-driven-development` and `building-blocks` skills.

## What It Tests

### Skills Under Test
- `content-driven-development` - Should model content structure before coding
- `building-blocks` - Should follow block implementation guidelines

### Key Behaviors
1. **Content-first approach**: Agent should design content model before writing code
2. **File structure**: Creates proper directory and files (`blocks/quote/quote.js`, `blocks/quote/quote.css`)
3. **Code quality**: Follows JavaScript and CSS guidelines from skills
4. **Process**: Announces skill usage, reads skill instructions, follows workflow
5. **Autonomy**: Completes task without unnecessary human intervention

## Expected Outcome

The agent should:
1. Read and announce usage of content-driven-development skill
2. Design a content model for the quote block
3. Read and announce usage of building-blocks skill
4. Create `blocks/quote/quote.js` with proper decoration function
5. Create `blocks/quote/quote.css` with mobile-first, scoped styles
6. Run linting and fix any issues
7. Complete without errors

### Example Expected Files

**blocks/quote/quote.js:**
```javascript
export default function decorate(block) {
  // Proper DOM manipulation
  // Clean, semantic HTML output
}
```

**blocks/quote/quote.css:**
```css
.quote {
  /* Mobile-first styles */
}

@media (min-width: 600px) {
  .quote {
    /* Tablet styles */
  }
}
```

## Canonical Pass Criteria

- ✅ Linting passes (`npm run lint`)
- ✅ Files exist: `blocks/quote/quote.js`, `blocks/quote/quote.css`
- ✅ No `var` declarations (should use `const`/`let`)
- ✅ CSS selectors are scoped to `.quote`
- ✅ Workflow steps completed: content-modeling, implementation, linting

## Flexible Quality Criteria

Evaluated and scored, but can vary:
- Code quality (30%)
- Process adherence (25%)
- Completeness (25%)
- Autonomy (20%)

## Common Failure Modes to Watch

- Skipping content modeling (jumping straight to code)
- Not announcing skill usage
- Using `var` instead of `const`/`let`
- CSS selectors not scoped properly
- Skipping linting step
- Creating unnecessary files
