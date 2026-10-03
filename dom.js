// @ts-check

import { Dates } from './shared/dates.js';

/**
 * Builds an element. Text is always inserted as text, never as HTML.
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {...unknown} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = String(value);
    else if (key === 'style' && typeof value === 'object' && value !== null) Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), /** @type {EventListener} */ (value));
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === '' || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** @param {string} id */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Today in the UK. */
export const today = () => Dates.londonDate();

/** DD/MM/YYYY. @param {string|null|undefined} iso */
export const uk = (iso) => Dates.formatUk(iso);
