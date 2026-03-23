---
name: frontend-design
description: >
  Create distinctive, production-grade frontend interfaces with high design quality.
  Generates creative, polished code that avoids generic AI aesthetics.
---

# Frontend Design

Create distinctive, production-grade interfaces that avoid generic "AI slop" aesthetics.

## Design Thinking

Before coding, commit to a BOLD aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme — brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian
- **Constraints**: Technical requirements (framework, performance, accessibility)
- **Differentiation**: What makes this UNFORGETTABLE?

## Aesthetics Guidelines

### Typography
- Choose fonts that are beautiful, unique, interesting
- AVOID: Arial, Inter, Roboto, system fonts
- PREFER: Distinctive display fonts paired with refined body fonts
- Sources: Google Fonts, Fontshare, fonts.bunny.net

### Color & Theme
- Commit to a cohesive aesthetic
- Use CSS variables for consistency
- Dominant colors with sharp accents > timid, evenly-distributed palettes
- AVOID: Purple-on-white clichés

### Motion
- Focus on high-impact moments
- One well-orchestrated page load with staggered reveals > scattered micro-interactions
- Use `animation-delay` for choreography
- CSS-only when possible; Motion library for React

### Spatial Composition
- Unexpected layouts
- Asymmetry, overlap, diagonal flow
- Grid-breaking elements
- Generous negative space OR controlled density

### Backgrounds & Details
- Create atmosphere and depth
- Gradient meshes, noise textures, geometric patterns
- Layered transparencies, dramatic shadows
- Custom cursors, grain overlays

## Anti-Patterns (Never Do)

- Generic component libraries without customization
- Overused color schemes (especially purple gradients)
- Predictable grid layouts
- System font stacks
- Cookie-cutter design lacking context

## Implementation

Match complexity to aesthetic vision:
- **Maximalist**: Elaborate code, extensive animations, layered effects
- **Minimalist**: Restraint, precision, careful spacing and typography

## Quick Reference

```css
/* Modern font loading */
@import url('https://fonts.bunny.net/css?family=...');

/* CSS variables for theming */
:root {
  --color-primary: #...;
  --color-accent: #...;
  --font-display: '...', sans-serif;
  --font-body: '...', sans-serif;
}

/* Staggered reveal animation */
.reveal-item {
  opacity: 0;
  transform: translateY(20px);
  animation: reveal 0.6s ease forwards;
}
.reveal-item:nth-child(1) { animation-delay: 0.1s; }
.reveal-item:nth-child(2) { animation-delay: 0.2s; }
/* ... */

@keyframes reveal {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Remember: Claude is capable of extraordinary creative work. Commit fully to a distinctive vision.
