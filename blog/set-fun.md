The game "Set" is a lovely game of pattern recognition and also teaches the player to be careful with their impulse to yell "set!" when they see one. Let's program the game.

## Generate the Deck
A deck of Set cards have 4 properties, each with 3 values. So we store each card as an array with 4 elements, each element can be an integer from 0 to 2.

```js
// Card as array: [number, symbol, shading, color]
function generateDeck() {
  const deck = [];
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      for (let c = 0; c < 3; c++) {
        for (let d = 0; d < 3; d++) {
          deck.push([a, b, c, d]);
        }
      }
    }
  }
  return deck; // Total of 81 cards
}

```
We also need a way to shuffle, we choose to do this in place, to save a little memory:

```js
// Shuffle the deck using Fisher-Yates algorithm
function shuffle(deck) {
for (let i = deck.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [deck[i], deck[j]] = [deck[j], deck[i]];
}
}
```

## Finding a set

A set in Set is defined as 3 cards where every property is either the same or different. This implementation is somewhat clever since it uses JavaScripts `Set` to find a set, by using it to check when only 2 properties are the same, and so not a set: 

```js
function isSet(card1, card2, card3) {
  for (let i = 0; i < 4; i++) {
    const values = new Set([card1[i], card2[i], card3[i]]);
    // either all same (size 1) or all different (size 3)
    if (values.size === 2) {
      return false;
    }
  }
  return true;
}
```

## Finding the sets on a board

A typical board will have 12 or 15 cards on it. When you play IRL these will be spread out as a grid; but for this program, we'll use a simple array representation. This implementation uses 3 loops, the first "primary" card, a "secondary" card later in the array, and a third card, later in the array still :

```js
function findSetsOnBoard(board) {
  const sets = [];
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      for (let k = j + 1; k < board.length; k++) {
        if (isSet(board[i], board[j], board[k])) {
          sets.push([board[i], board[j], board[k]]);
        }
      }
    }
  }
  return sets;
}

```

## Rendering a card
```html
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180">
    <defs>

        <pattern id="stripes" patternUnits="userSpaceOnUse" width="6" height="6">
            <rect width="3" height="6" fill="#d22" opacity="0.45"/>
            <rect x="3" width="3" height="6" fill="white" />
        </pattern>

    </defs>
    <rect x="0" y="0" width="120" height="180" rx="18" fill="white" stroke="#aaa" stroke-width="4"/>
    <path d="
        M 38 64
        Q 50 32, 70 44
        Q 85 54, 82 42
        Q 65 66, 38 44
        Z"
          stroke="#d22" stroke-width="4" fill="url(#stripes)" />
    <path d="
        M 38 100
        Q 50 68, 70 80
        Q 85 90, 82 78
        Q 65 102, 38 80
        Z"
          stroke="#d22" stroke-width="4" fill="url(#stripes)" />
    <path d="
        M 38 136
        Q 50 104, 70 116
        Q 85 126, 82 114
        Q 65 138, 38 116
        Z"
          stroke="#d22" stroke-width="4" fill="url(#stripes)" />
</svg>
```
```js
function cardToSVG([number, symbol, shading, color], width = 120, height = 180) {
  // Color palette: red, green, purple
  const colors = ['#d22', '#292', '#828'];
  // Y positions for symbols
  const symbolYs = [
    [height / 2],
    [height / 2 - 24, height / 2 + 24],
    [height / 2 - 36, height / 2, height / 2 + 36]
  ][number];

  // Helper: Symbol shape SVG snippets
  function renderShape(cx, cy) {
    switch (symbol) {
      // Oval
      case 0: return `<ellipse cx="${cx}" cy="${cy}" rx="32" ry="16" stroke="${colors[color]}"
        stroke-width="4" fill="${getFill(colors[color])}" />`;
      // Diamond
      case 1: return `<polygon points="${cx-28},${cy} ${cx},${cy-17} ${cx+28},${cy} ${cx},${cy+17}" 
        stroke="${colors[color]}" stroke-width="4" fill="${getFill(colors[color])}" />`;
      // Squiggle (approximated as a ribbon curve)
      case 2: return `<path d="
        M ${cx-22} ${cy+10}
        Q ${cx-10} ${cy-22}, ${cx+10} ${cy-10}
        Q ${cx+25} ${cy}, ${cx+22} ${cy-12}
        Q ${cx+5} ${cy+12}, ${cx-22} ${cy-10}
        Z"
        stroke="${colors[color]}" stroke-width="4" fill="${getFill(colors[color])}" />`;
    }
  }

  // Helper: Shading fill (solid, striped, open)
  function getFill(baseColor) {
    if (shading === 0) return baseColor;          // solid
    if (shading === 1) return 'url(#stripes)';    // striped
    return 'none';                                // open
  }

  // Stripe pattern for striped shading
  const stripePattern = `
    <pattern id="stripes" patternUnits="userSpaceOnUse" width="6" height="6">
      <rect width="3" height="6" fill="${colors[color]}" opacity="0.45"/>
      <rect x="3" width="3" height="6" fill="white" />
    </pattern>
  `;

  // Card symbols
  const symbols = symbolYs.map(y => renderShape(width/2, y)).join('\n');

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    ${shading === 1 ? stripePattern : ''}
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="white" stroke="#aaa" stroke-width="4"/>
  ${symbols}
</svg>
  `.trim();
}

// Example usage:
const svgString = cardToSVG([2, 2, 1, 0]); // three diamonds, striped, red
console.log(svgString);

```