import { THEMES, useTheme } from '../../context/ThemeContext';

/**
 * A select rather than a sun/moon switch: with more than two themes a two-way
 * toggle cannot represent the current value. `.select` is already styled by the
 * shared input rules in index.css.
 */
const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <select
      className="select select-ghost select-sm w-auto"
      value={theme}
      onChange={(event) => setTheme(event.target.value)}
      aria-label="Colour theme"
    >
      {THEMES.map(({ id, label }) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
};

export default ThemeToggle;
