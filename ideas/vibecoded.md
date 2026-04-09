# Signs of Vibe Coded UI

**yuwen lu** ([@yuwen*lu*](https://x.com/yuwen_lu_)) · Apr 6 · 8 min read

---

Claude no longer generates purple gradients, I'm so glad we are past that. AI's design quality has been improving in general, but I still see plenty of bad patterns in vibe-coded UIs.

In this article, I summarize common bad patterns in AI-generated website design. For each bad design pattern, I provide examples together with improvement ideas. If you are:

- **A developer** — watch out for these visual patterns and improve them to make your vibe-coded app more polished
- **A researcher at a frontier lab** — use this as a reference of what to take out from your training data or where to avoid reward hacking
- **A designer** — don't get too frustrated, these will eventually be solved :)

My analysis is roughly organized into: color, visual assets, typography, and animations. Examples are either generated with Claude or sourced from [designarena.ai](https://designarena.ai).

---

## Color: Homogenous Goo

AI models tend to generate colors that are mushed together. A cyan icon in a sky blue box, wrapped in a card of a different shade of blue, with a slightly transparent minty blue border.

**How to fix:** What you need instead is a color system that follows the **70/20/10 rule**:

- **70%** of the website in main neutral colors
- **20%** in complementary colors
- **10%** accent/contrast tones that pop out

The Cursor website is a well-designed example — mostly neutral and complementary colors (dark gray and a slightly lighter gray), then distinctive orange and white buttons as accents that draw attention. Notice how you don't need borders if background colors already separate UI elements naturally.

---

## Visual Assets: Simple Icons in a Rounded Square

You almost see this in any AI-generated design. Wherever you'd normally put a visual asset, you see a Font Awesome icon or emoji wrapped in a small colored box. The box background is often the same hue.

**Why they're bad:**

1. They don't really communicate any information
2. They don't visually distinguish your site and show a lack of care

**How to fix:** Honestly, in many cases, just drop the icon completely — they don't convey much information anyway. Icons are often more helpful for action-driven components (like a button) than informational UI elements.

> The floating chat button in the bottom right corner is a dead giveaway that it is AI-generated. If that's your customer support experience, consider a complete overhaul.

This pattern shows up across many models — likely a result of training datasets over-indexing on website templates that can lack visual polish.

---

## Visual Assets: Overuse of Emojis

Related to the icon-in-box pattern above, AI models love to use emojis as visual assets. This is almost always bad — a mistake many developers make when designing their first websites.

**How to fix:** Don't use emojis. Use icons with **no rounded square box**. Use an off-the-shelf solution like Font Awesome or [lucide.dev](https://lucide.dev), or generate stylistic ones with AI. A little design intention goes a long way.

---

## Typography: Excessive Serif Font

Serif fonts have small decorative "feet" or strokes at the ends of letters, giving a formal, classic feel.

Around last year, the **Instrument Serif** font (sometimes called the "David bar serif") became trendy again — but too quickly became overused, leading to community backlash.

AI models, especially Claude, seem to love them now. Many AI-generated websites have a serif hero section, almost as if it's Claude's perception of "elegant" design. A stylistic choice like this can go stale quickly once overused — avoid it unless you know what you're doing.

Interestingly, other AI models don't include this pattern as much as Claude, suggesting something specific to Anthropic's training data or reward model.

---

## Typography/Visuals: Glassmorphism Everywhere

Glassmorphism is a semi-transparent, frosted glass/noise texture design style. This is becoming **the new purple gradient**. Once you notice it, you see it everywhere. If paired with a gradient background and a 1px light border, it's almost certainly AI.

If not used well, Glassmorphism kills readability. It took Apple quite a few Developer Betas to make Liquid Glass mostly readable — one-off AI generation can easily mess it up. AI glassmorphism shows up not just in card design, but also in small badges and buttons.

> **Side note:** The green border pattern where both a `border-left` and a `border-radius` are applied to the same container is also a known vibe coding tell. The simplest fix is to remove the border entirely.

Glassmorphism might not be a bad pattern in general — but once a style is overused everywhere, it quickly goes out of fashion.

---

## Gradients and Shadows: Out of Place

AI models overuse gradients and shadows in unnecessary places. Linear gradients highlighting words and buttons are everywhere.

The fact that AI can churn out linear gradients quickly doesn't mean they have to be everywhere. At this point, linear gradients are abused so much that they no longer make sense. Maybe it's sadly another good thing ruined by AI — just like em dashes.

**Shadow mistakes:** A shadow behind a button that makes the top half blend with the background creates an unnecessary spatial hierarchy that feels out of place.

**How to fix:** Use an accent color as the button background with no special border or shadow. Simple white buttons on the Cursor website are effective examples.

---

## Visual Hierarchy: Excessive Nested Layers

AI still struggles with visual hierarchy. A good visual hierarchy guides users to look at the most important things first, then gradually to less important details — using fine-grained attributes like font size, weight, and color.

A clear visual hierarchy is **glanceable**: within a split second, the user subconsciously understands where to look first, second, and thereafter.

AI tends to create nested layouts — cards within cards. An extra container for a secondary element is usually unnecessary.

**How to fix:** Remove the extra containers. Tone down secondary text to make it visually "quieter" than the primary description.

---

## Animations: Unnecessary or Just Broken

AI creates UI animations excessively. Like linear gradients, UI animations are strong stylistic signals that should be used carefully.

Common failures:

- Hover animations that move the card up while growing the image — different directions, feels random
- Appear animations that are slow and distracting, making the user tired
- Animations that break when elements haven't entered the viewport yet

These issues are everywhere in AI designs. **Animations should serve a purpose.** A good rule: if you can't articulate _why_ the animation is there, remove it.

---

## Summary

Many bad AI designs lack the right balance. Sometimes the font is too big or too small. Spacing is off. Colors don't harmonize. It takes months of careful inspection to understand the why's and how's of when UIs look off.

A common theme in vibe-coded design slop is **unnecessary details**:

- You _can_ add an animation, but that doesn't mean you _should_
- Glassmorphism looks cool but doesn't fit all occasions
- When UI can be generated for free, we see an abundance of flashy design that isn't tastefully assembled

These patterns exist because of training data and reward signals — not because AI can't do better.

> **Clear messages beat noise. Intention beats carelessness. Own your creativity, think different.**

We will eventually get there. But before that day, design taste and intention are still key.

---

_yuwen lu — design engineer / PhD candidate at Notre Dame, human-AI interaction_  
_[@yuwen*lu*](https://x.com/yuwen_lu_)_
