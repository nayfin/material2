/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

/**
 * Moves an item one index in an array to another.
 * @param array Array in which to move the item.
 * @param fromIndex Starting index of the item.
 * @param toIndex Index to which the item should be moved.
 */
export function moveItemInArray<T = any>(array: T[], fromIndex: number, toIndex: number): void {
  const from = clamp(fromIndex, 0, array.length - 1);
  const to = clamp(toIndex, 0, array.length - 1);

  if (from === to) {
    return;
  }

  const target = array[from];
  const delta = to < from ? -1 : 1;

  for (let i = from; i !== to; i += delta) {
    array[i] = array[i + delta];
  }

  array[to] = target;
}


/**
 * Moves an item from one array to another.
 * @param currentArray Array from which to transfer the item.
 * @param targetArray Array into which to put the item.
 * @param currentIndex Index of the item in its current array.
 * @param targetIndex Index at which to insert the item.
 */
export function transferArrayItem<T = any>(currentArray: T[],
                                           targetArray: T[],
                                           currentIndex: number,
                                           targetIndex: number): void {
  const from = clamp(currentIndex, 0, currentArray.length - 1);
  const to = clamp(targetIndex, 0, targetArray.length);

  if (currentArray.length) {
    targetArray.splice(to, 0, currentArray.splice(from, 1)[0]);
  }
}

/**
 * Copies an item from one array to another, leaving it in its
 * original position in current array.
 * @param currentArray Array from which to copy the item.
 * @param targetArray Array into which is copy the item.
 * @param currentIndex Index of the item in its current array.
 * @param targetIndex Index at which to insert the item.
 *
 */
export function copyArrayItem<T = any>(currentArray: T[],
                                       targetArray: T[],
                                       currentIndex: number,
                                       targetIndex: number): void {
  const to = clamp(targetIndex, 0, targetArray.length);

  if (currentArray.length) {
    targetArray.splice(to, 0, currentArray[currentIndex]);
  }
}

/** Clamps a number between a minimum and a maximum. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Gets a 3d `transform` that can be applied to an element.
 * @param x Desired position of the element along the X axis.
 * @param y Desired position of the element along the Y axis.
 */
export function getTransform(x: number, y: number): string {
  // Round the transforms since some browsers will
  // blur the elements for sub-pixel transforms.
  return `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

/** Creates a deep clone of an element. */
export function deepCloneNode(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;
  const descendantsWithId = clone.querySelectorAll('[id]');

  // Remove the `id` to avoid having multiple elements with the same id on the page.
  clone.removeAttribute('id');

  for (let i = 0; i < descendantsWithId.length; i++) {
    descendantsWithId[i].removeAttribute('id');
  }

  return clone;
}

/**
 * Helper to remove an element from the DOM and to do all the necessary null checks.
 * @param element Element to be removed.
 */
export function removeElement(element: HTMLElement | null) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

/** Determines whether an event is a touch event. */
export function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return event.type.startsWith('touch');
}

/** Gets the element into which the drag preview should be inserted. */
export function getPreviewInsertionPoint(documentRef: any): HTMLElement {
  // We can't use the body if the user is in fullscreen mode,
  // because the preview will render under the fullscreen element.
  // TODO(crisbeto): dedupe this with the `FullscreenOverlayContainer` eventually.
  return documentRef.fullscreenElement ||
         documentRef.webkitFullscreenElement ||
         documentRef.mozFullScreenElement ||
         documentRef.msFullscreenElement ||
         documentRef.body;
}
