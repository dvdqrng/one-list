# Color System Documentation

This app uses a centrally controlled semantic color system defined in `app/globals.css`. All colors are defined using CSS custom properties and support both light and dark modes.

## 🎨 Available Semantic Colors

### Text Colors
Use these Tailwind classes for text:

| Class | Usage | Light Mode | Dark Mode |
|-------|-------|------------|-----------|
| `text-foreground` | Primary text (default) | Dark gray | Light gray |
| `text-muted-foreground` | Secondary/disabled text | Medium gray | Medium gray |
| `text-primary` | Brand/accent text | Blue | Bright blue |
| `text-destructive` | Error/danger text | Red | Red |
| `text-warning` | Warning/timeout text | Orange/yellow | Orange/yellow |

### Background Colors
Use these Tailwind classes for backgrounds:

| Class | Usage | Light Mode | Dark Mode |
|-------|-------|------------|-----------|
| `bg-background` | Page background | White | Dark gray |
| `bg-card` | Card background | White | Darker gray |
| `bg-primary` | Brand/accent bg | Blue | Bright blue |
| `bg-secondary` | Secondary bg | Light gray | Dark gray |
| `bg-muted` | Muted/disabled bg | Very light gray | Dark gray |
| `bg-destructive` | Error/danger bg | Red | Red |
| `bg-accent` | Hover/focus bg | Purple | Purple |

### Foreground Pairs
When using colored backgrounds, always use the corresponding foreground color:

- `bg-primary` → `text-primary-foreground`
- `bg-secondary` → `text-secondary-foreground`
- `bg-destructive` → `text-destructive-foreground`
- `bg-warning` → `text-warning-foreground`
- `bg-accent` → `text-accent-foreground`

### Border & Ring Colors
- `border-border` - Default border color
- `ring-ring` - Focus ring color

## 🚫 What NOT to Do

**NEVER use hardcoded colors like:**
- ❌ `text-orange-500`
- ❌ `bg-blue-600`
- ❌ `text-white` (use `text-primary-foreground` or `text-destructive-foreground` instead)
- ❌ `#FF5733` or other hex codes

**Always use semantic color names instead:**
- ✅ `text-warning`
- ✅ `bg-primary`
- ✅ `text-destructive-foreground`

## 📝 Usage Examples

### Success Message
```tsx
<span className="text-primary font-medium">
  ✓ Task added successfully
</span>
```

### Error Message
```tsx
<span className="text-destructive font-medium">
  ✗ Failed to save
</span>
```

### Warning Message
```tsx
<span className="text-warning font-medium">
  ⚠ Request timed out
</span>
```

### Button Variants
```tsx
<Button variant="default">Primary Action</Button>
<Button variant="secondary">Secondary Action</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outlined</Button>
<Button variant="ghost">Ghost</Button>
```

### Badge Variants
```tsx
<Badge variant="default">High Priority</Badge>
<Badge variant="secondary">Low Priority</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Category</Badge>
```

## 🎨 Color Palette Reference

All colors are defined in OKLCH color space for perceptual uniformity:

### Light Mode
- **Primary**: `oklch(0.45 0.15 250)` - Blue
- **Destructive**: `oklch(0.577 0.245 27.325)` - Red
- **Warning**: `oklch(0.65 0.18 60)` - Orange/Yellow
- **Accent**: `oklch(0.55 0.18 280)` - Purple

### Dark Mode
- **Primary**: `oklch(0.55 0.18 260)` - Bright Blue
- **Destructive**: `oklch(0.5 0.2 27)` - Red
- **Warning**: `oklch(0.7 0.2 70)` - Orange/Yellow
- **Accent**: `oklch(0.6 0.2 280)` - Purple

## 🔧 Modifying Colors

To change the color scheme:

1. Edit `app/globals.css`
2. Modify the CSS custom properties in `:root` (light mode) and `.dark` (dark mode)
3. Colors will automatically update across the entire app

## 📋 Component Color Usage

### Button Component
Uses semantic colors via the `variant` prop:
- `default` - Primary brand color
- `destructive` - Error/danger color
- `secondary` - Secondary/muted color
- `outline` - Border only with foreground text
- `ghost` - Transparent with hover effect

### Badge Component
Uses semantic colors via the `variant` prop:
- `default` - Primary brand color
- `destructive` - Error/danger color
- `secondary` - Secondary/muted color
- `outline` - Border only with foreground text

### Text Editor
- Task text: `text-foreground` (default)
- Completed tasks: `line-through opacity-60`
- Metadata badges: Use Badge component variants

### Sidebar
- Headers: `text-foreground font-medium`
- Labels: `text-muted-foreground`
- Content: `text-foreground`

## 🌙 Dark Mode

Dark mode is automatically supported for all semantic colors. The color system uses CSS custom properties that are redefined in the `.dark` class, ensuring consistent appearance across both themes.
