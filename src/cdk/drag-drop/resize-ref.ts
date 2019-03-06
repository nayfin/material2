/**
  * @license
  * Copyright Google LLC All Rights Reserved.
  *
  * Use of this source code is governed by an MIT-style license that can be
  * found in the LICENSE file at https://angular.io/license
  */

import {ElementRef, NgZone} from '@angular/core';
import {ViewportRuler} from '@angular/cdk/scrolling';
import {normalizePassiveListenerOptions} from '@angular/cdk/platform';
import {coerceBooleanProperty, coerceElement} from '@angular/cdk/coercion';
import {Subscription, Subject, Observable, Observer} from 'rxjs';
import {DropListRefInternal as DropListRef} from './drop-list-ref';
import {toggleNativeDragInteractions} from './drag-styling';

/** Object that can be used to configure the behavior of ResizeRef. */
export interface ResizeRefConfig {
  /**
   * Minimum amount of pixels that the user should
   * drag, before the CDK initiates a drag sequence.
   */
  dragStartThreshold: number;

  /**
   * Amount the pixels the user should drag before the CDK
   * considers them to have changed the drag direction.
   */
  pointerDirectionChangeThreshold: number;
}

/** Options that can be used to bind a passive event listener. */
const passiveEventListenerOptions = normalizePassiveListenerOptions({ passive: true });

/** Options that can be used to bind an active event listener. */
const activeEventListenerOptions = normalizePassiveListenerOptions({ passive: false });

/**
 * Time in milliseconds for which to ignore mouse events, after
 * receiving a touch event. Used to avoid doing double work for
 * touch devices where the browser fires fake mouse events, in
 * addition to touch events.
 */
const MOUSE_EVENT_IGNORE_TIME = 800;

// TODO(crisbeto): add auto-scrolling functionality.
// TODO(crisbeto): add an API for moving a draggable up/down the
// list programmatically. Useful for keyboard controls.

/**
 * Internal compile-time-only representation of a `ResizeRef`.
 * Used to avoid circular import issues between the `ResizeRef` and the `DropListRef`.
 * @docs-private
 */
export interface ResizeRefnternal extends ResizeRef { }

/**
 * Reference to a draggable item. Used to manipulate or dispose of the item.
 * @docs-private
 */
export class ResizeRef<T = any> {

  /** Coordinates within the element at which the user picked up the element. */
  private _pickupPositionInElement: Point;

  /** Coordinates on the page at which the user picked up the element. */
  private _pickupPositionOnPage: Point;

  /**
   * CSS `transform` applied to the element when it isn't being dragged. We need a
   * passive transform in order for the dragged element to retain its new position
   * after the user has stopped dragging and because we need to know the relative
   * position in case they start dragging again. This corresponds to `element.style.transform`.
   */
  private _passiveTransform: Point = { x: 0, y: 0 };

  /** CSS `transform` that is applied to the element while it's being dragged. */
  private _activeTransform: Point = { x: 0, y: 0 };

  /** Inline `transform` value that the element had before the first dragging sequence. */
  private _initialTransform?: string;

  /**
   * Whether the dragging sequence has been started. Doesn't
   * necessarily mean that the element has been moved.
   */
  private _hasStartedDragging: boolean;

  /** Whether the element has moved since the user started dragging it. */
  private _hasMoved: boolean;

  /** Drop container in which the ResizeRefresided when dragging began. */
  private _initialContainer: DropListRef;

  /** Cached scroll position on the page when the element was picked up. */
  private _scrollPosition: { top: number, left: number };

  /** Emits when the item is being moved. */
  private _moveEvents = new Subject<{
    source: ResizeRef;
    pointerPosition: { x: number, y: number };
    event: MouseEvent | TouchEvent;
    delta: { x: -1 | 0 | 1, y: -1 | 0 | 1 };
  }>();

  /**
   * Amount of subscriptions to the move event. Used to avoid
   * hitting the zone if the consumer didn't subscribe to it.
   */
  private _moveEventSubscriptions = 0;

  /** Keeps track of the direction in which the user is dragging along each axis. */
  private _pointerDirectionDelta: { x: -1 | 0 | 1, y: -1 | 0 | 1 };

  /** Pointer position at which the last change in the delta occurred. */
  private _pointerPositionAtLastDirectionChange: Point;

  /**
   * Root DOM node of the drag instance. This is the element that will
   * be moved around as the user is dragging.
   */
  private _rootElement: HTMLElement;

  /**
   * Inline style value of `-webkit-tap-highlight-color` at the time the
   * dragging was started. Used to restore the value once we're done dragging.
   */
  private _rootElementTapHighlight: string | null;

  /** Subscription to pointer movement events. */
  private _pointerMoveSubscription = Subscription.EMPTY;

  /** Subscription to the event that is dispatched when the user lifts their pointer. */
  private _pointerUpSubscription = Subscription.EMPTY;

  /**
   * Time at which the last touch event occurred. Used to avoid firing the same
   * events multiple times on touch devices where the browser will fire a fake
   * mouse event for each touch event, after a certain time.
   */
  private _lastTouchEventTime: number;

  /** Cached reference to the boundary element. */
  private _boundaryElement: HTMLElement | null = null;

  /** Whether the native dragging interactions have been enabled on the root element. */
  private _nativeInteractionsEnabled = true;

  /** Whether starting to drag this element is disabled. */
  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(value: boolean) {
    const newValue = coerceBooleanProperty(value);

    if (newValue !== this._disabled) {
      this._disabled = newValue;
      this._toggleNativeDragInteractions();
    }
  }
  private _disabled = false;

  /** Emits as the drag sequence is being prepared. */
  beforeStarted = new Subject<void>();

  /** Emits when the user starts dragging the item. */
  started = new Subject<{ source: ResizeRef}>();

  /** Emits when the user has released a drag item, before any animations have started. */
  released = new Subject<{ source: ResizeRef}>();

  /** Emits when the user stops dragging an item in the container. */
  ended = new Subject<{ source: ResizeRef}>();

  /** Emits when the user drops the item inside a container. */
  dropped = new Subject<{}>();

  /**
   * Emits as the user is dragging the item. Use with caution,
   * because this event will fire for every pixel that the user has dragged.
   */
  moved: Observable<{
    source: ResizeRef
    pointerPosition: { x: number, y: number };
    event: MouseEvent | TouchEvent;
    delta: { x: -1 | 0 | 1, y: -1 | 0 | 1 };
  }> = new Observable((observer: Observer<any>) => {
    const subscription = this._moveEvents.subscribe(observer);
    this._moveEventSubscriptions++;

    return () => {
      subscription.unsubscribe();
      this._moveEventSubscriptions--;
    };
  });

  /** Arbitrary data that can be attached to the drag item. */
  data: T;

  constructor(
    element: ElementRef<HTMLElement> | HTMLElement,
    private _config: ResizeRefConfig,
    private _ngZone: NgZone,
    private _viewportRuler: ViewportRuler) {

    this.withRootElement(element);
  }

  /** Returns the root draggable element. */
  getRootElement(): HTMLElement {
    return this._rootElement;
  }

  /**
   * Sets an alternate drag root element. The root element is the element that will be moved as
   * the user is dragging. Passing an alternate root element is useful when trying to enable
   * dragging on an element that you might not have access to.
   */
  withRootElement(rootElement: ElementRef<HTMLElement> | HTMLElement): this {
    const element = coerceElement(rootElement);

    if (element !== this._rootElement) {
      if (this._rootElement) {
        this._removeRootElementListeners(this._rootElement);
      }

      element.addEventListener('mousedown', this._pointerDown, activeEventListenerOptions);
      element.addEventListener('touchstart', this._pointerDown, passiveEventListenerOptions);
      this._initialTransform = undefined;
      this._rootElement = element;
    }

    return this;
  }

  /** Removes the dragging functionality from the DOM element. */
  dispose() {
    this._removeRootElementListeners(this._rootElement);

    // Do this check before removing from the registry since it'll
    // stop being considered as dragged once it is removed.
    if (this.isDragging()) {
      // Since we move out the element to the end of the body while it's being
      // dragged, we have to make sure that it's removed if it gets destroyed.
      removeElement(this._rootElement);
    }

    this._removeSubscriptions();
    this.beforeStarted.complete();
    this.started.complete();
    this.released.complete();
    this.ended.complete();
    this.dropped.complete();
    this._moveEvents.complete();
  }

  /** Checks whether the element is currently being dragged. */
  isDragging(): boolean {
    return this._hasStartedDragging;
  }

  /** Resets a standalone drag item to its initial position. */
  reset(): void {
    this._rootElement.style.transform = this._initialTransform || '';
    this._activeTransform = { x: 0, y: 0 };
    this._passiveTransform = { x: 0, y: 0 };
  }

  /** Unsubscribes from the global subscriptions. */
  private _removeSubscriptions() {
    this._pointerMoveSubscription.unsubscribe();
    this._pointerUpSubscription.unsubscribe();
  }

  /** Handler for the `mousedown`/`touchstart` events. */
  private _pointerDown = (event: MouseEvent | TouchEvent) => {
    this.beforeStarted.next();
    if (!this.disabled) {
      this._initializeDragSequence(this._rootElement, event);
    }
  }

  /** Handler that is invoked when the user moves their pointer after they've initiated a drag. */
  private _pointerMove = (event: MouseEvent | TouchEvent) => {

    const pointerPosition = this._getPointerPositionOnPage(event);
    if (!this._hasStartedDragging) {
      const distanceX = Math.abs(pointerPosition.x - this._pickupPositionOnPage.x);
      const distanceY = Math.abs(pointerPosition.y - this._pickupPositionOnPage.y);

      // Only start dragging after the user has moved more than the minimum distance in either
      // direction. Note that this is preferrable over doing something like `skip(minimumDistance)`
      // in the `pointerMove` subscription, because we're not guaranteed to have one move event
      // per pixel of movement (e.g. if the user moves their pointer quickly).
      if (distanceX + distanceY >= this._config.dragStartThreshold) {
        this._hasStartedDragging = true;
        this._ngZone.run(() => this._startDragSequence(event));
      }

      return;
    }

    // We only need the preview dimensions if we have a boundary element.
    if (this._boundaryElement) {
      // Cache the preview element rect if we haven't cached it already or if
      // we cached it too early before the element dimensions were computed.
    }

    this._hasMoved = true;
    event.preventDefault();
    this._updatePointerDirectionDelta(pointerPosition);


    const activeTransform = this._activeTransform;
    activeTransform.x = pointerPosition.x - this._pickupPositionOnPage.x + this._passiveTransform.x;
    activeTransform.y = pointerPosition.y - this._pickupPositionOnPage.y + this._passiveTransform.y;
    const transform = getTransform(activeTransform.x, activeTransform.y);

    // Preserve the previous `transform` value, if there was one. Note that we apply our own
    // transform before the user's, because things like rotation can affect which direction
    // the element will be translated towards.
    this._rootElement.style.transform = this._initialTransform ?
      transform + ' ' + this._initialTransform : transform;

    // Apply transform as attribute if dragging and svg element to work for IE
    if (typeof SVGElement !== 'undefined' && this._rootElement instanceof SVGElement) {
      const appliedTransform = `translate(${activeTransform.x} ${activeTransform.y})`;
      this._rootElement.setAttribute('transform', appliedTransform);
    }


    // Since this event gets fired for every pixel while dragging, we only
    // want to fire it if the consumer opted into it. Also we have to
    // re-enter the zone because we run all of the events on the outside.
    if (this._moveEventSubscriptions > 0) {
      this._ngZone.run(() => {
        this._moveEvents.next({
          source: this,
          pointerPosition,
          event,
          delta: this._pointerDirectionDelta
        });
      });
    }
  }

  /** Handler that is invoked when the user lifts their pointer up, after initiating a drag. */
  private _pointerUp = (event: MouseEvent | TouchEvent) => {


    this._removeSubscriptions();

    if (!this._hasStartedDragging) {
      return;
    }

    this.released.next({ source: this });

    // Convert the active transform into a passive one. This means that next time
    // the user starts dragging the item, its position will be calculated relatively
    // to the new passive transform.
    this._passiveTransform.x = this._activeTransform.x;
    this._passiveTransform.y = this._activeTransform.y;
    this._ngZone.run(() => this.ended.next({ source: this }));
    return;
  }

  /** Starts the dragging sequence. */
  private _startDragSequence(event: MouseEvent | TouchEvent) {
    // Emit the event on the item before the one on the container.
    this.started.next({ source: this });

    if (isTouchEvent(event)) {
      this._lastTouchEventTime = Date.now();
    }
  }

  /**
   * Sets up the different variables and subscriptions
   * that will be necessary for the dragging sequence.
   * @param referenceElement Element that started the drag sequence.
   * @param event Browser event object that started the sequence.
   */
  private _initializeDragSequence(referenceElement: HTMLElement, event: MouseEvent | TouchEvent) {
    // Always stop propagation for the event that initializes
    // the dragging sequence, in order to prevent it from potentially
    // starting another sequence for a draggable parent somewhere up the DOM tree.
    event.stopPropagation();

    const isDragging = this.isDragging();
    const isTouchSequence = isTouchEvent(event);
    const isAuxiliaryMouseButton = !isTouchSequence && (event as MouseEvent).button !== 0;
    // const rootElement = this._rootElement;
    const isSyntheticEvent = !isTouchSequence && this._lastTouchEventTime &&
      this._lastTouchEventTime + MOUSE_EVENT_IGNORE_TIME > Date.now();

    // If the event started from an element with the native HTML drag&drop, it'll interfere
    // with our own dragging (e.g. `img` tags do it by default). Prevent the default action
    // to stop it from happening. Note that preventing on `dragstart` also seems to work, but
    // it's flaky and it fails if the user drags it away quickly. Also note that we only want
    // to do this for `mousedown` since doing the same for `touchstart` will stop any `click`
    // events from firing on touch devices.
    if (event.target && (event.target as HTMLElement).draggable && event.type === 'mousedown') {
      event.preventDefault();
    }

    // Abort if the user is already dragging or is using a mouse button other than the primary one.
    if (isDragging || isAuxiliaryMouseButton || isSyntheticEvent) {
      return;
    }

    // Cache the previous transform amount only after the first drag sequence, because
    // we don't want our own transforms to stack on top of each other.
    if (this._initialTransform == null) {
      this._initialTransform = this._rootElement.style.transform || '';
    }

    this._toggleNativeDragInteractions();
    this._hasStartedDragging = this._hasMoved = false;
    this._scrollPosition = this._viewportRuler.getViewportScrollPosition();

    // If we have a custom preview template, the element won't be visible anyway so we avoid the
    // extra `getBoundingClientRect` calls and just move the preview next to the cursor.
    this._pickupPositionInElement = this._getPointerPositionInElement(referenceElement, event);
    const pointerPosition = this._pickupPositionOnPage = this._getPointerPositionOnPage(event);
    this._pointerDirectionDelta = { x: 0, y: 0 };
    this._pointerPositionAtLastDirectionChange = { x: pointerPosition.x, y: pointerPosition.y };
  }

  /** Cleans up the DOM artifacts that were added to facilitate the element being dragged. */
  private _cleanupDragArtifacts(event: MouseEvent | TouchEvent) {
    // Restore the element's visibility and insert it at its old position in the DOM.
    // It's important that we maintain the position, because moving the element around in the DOM
    // can throw off `NgFor` which does smart diffing and re-creates elements only when necessary,
    // while moving the existing elements in all other cases.
    this._rootElement.style.display = '';

    // Re-enter the NgZone since we bound `document` events on the outside.
    this._ngZone.run(() => {
      const { x, y } = this._getPointerPositionInElement(this._rootElement, event);

      this.ended.next({ source: this });
      this.dropped.next({
        item: this,
        previousContainer: this._initialContainer,
        pointerPositionInElement: { x, y }
      });
    });
  }

  /**
   * Figures out the coordinates at which an element was picked up.
   * @param referenceElement Element that initiated the dragging.
   * @param event Event that initiated the dragging.
   */
  private _getPointerPositionInElement(referenceElement: HTMLElement,
    event: MouseEvent | TouchEvent): Point {
    const elementRect = this._rootElement.getBoundingClientRect();
    const handleElement = referenceElement === this._rootElement ? null : referenceElement;
    const referenceRect = handleElement ? handleElement.getBoundingClientRect() : elementRect;
    const point = isTouchEvent(event) ? event.targetTouches[0] : event;
    const x = point.pageX - referenceRect.left - this._scrollPosition.left;
    const y = point.pageY - referenceRect.top - this._scrollPosition.top;

    return {
      x: referenceRect.left - elementRect.left + x,
      y: referenceRect.top - elementRect.top + y
    };
  }

  /** Determines the point of the page that was touched by the user. */
  private _getPointerPositionOnPage(event: MouseEvent | TouchEvent): Point {
    // `touches` will be empty for start/end events so we have to fall back to `changedTouches`.
    const point = isTouchEvent(event) ? (event.touches[0] || event.changedTouches[0]) : event;

    return {
      x: point.pageX - this._scrollPosition.left,
      y: point.pageY - this._scrollPosition.top
    };
  }


  // /** Gets the pointer position on the page, accounting for any position constraints. */
  // private _getConstrainedPointerPosition(event: MouseEvent | TouchEvent): Point {
  //   const point = this._getPointerPositionOnPage(event);

  //   if (this._boundaryRect) {
  //     const { x: pickupX, y: pickupY } = this._pickupPositionInElement;
  //     const boundaryRect = this._boundaryRect;
  //     const previewRect = this._previewRect!;
  //     const minY = boundaryRect.top + pickupY;
  //     const maxY = boundaryRect.bottom - (previewRect.height - pickupY);
  //     const minX = boundaryRect.left + pickupX;
  //     const maxX = boundaryRect.right - (previewRect.width - pickupX);

  //     point.x = clamp(point.x, minX, maxX);
  //     point.y = clamp(point.y, minY, maxY);
  //   }

  //   return point;
  // }


  /** Updates the current drag delta, based on the user's current pointer position on the page. */
  private _updatePointerDirectionDelta(pointerPositionOnPage: Point) {
    const { x, y } = pointerPositionOnPage;
    const delta = this._pointerDirectionDelta;
    const positionSinceLastChange = this._pointerPositionAtLastDirectionChange;

    // Amount of pixels the user has dragged since the last time the direction changed.
    const changeX = Math.abs(x - positionSinceLastChange.x);
    const changeY = Math.abs(y - positionSinceLastChange.y);

    // Because we handle pointer events on a per-pixel basis, we don't want the delta
    // to change for every pixel, otherwise anything that depends on it can look erratic.
    // To make the delta more consistent, we track how much the user has moved since the last
    // delta change and we only update it after it has reached a certain threshold.
    if (changeX > this._config.pointerDirectionChangeThreshold) {
      delta.x = x > positionSinceLastChange.x ? 1 : -1;
      positionSinceLastChange.x = x;
    }

    if (changeY > this._config.pointerDirectionChangeThreshold) {
      delta.y = y > positionSinceLastChange.y ? 1 : -1;
      positionSinceLastChange.y = y;
    }

    return delta;
  }

  /** Toggles the native drag interactions, based on how many handles are registered. */
  private _toggleNativeDragInteractions() {
    if (!this._rootElement) {
      return;
    }

    const shouldEnable = this.disabled;

    if (shouldEnable !== this._nativeInteractionsEnabled) {
      this._nativeInteractionsEnabled = shouldEnable;
      toggleNativeDragInteractions(this._rootElement, shouldEnable);
    }
  }

  /** Removes the manually-added event listeners from the root element. */
  private _removeRootElementListeners(element: HTMLElement) {
    element.removeEventListener('mousedown', this._pointerDown, activeEventListenerOptions);
    element.removeEventListener('touchstart', this._pointerDown, passiveEventListenerOptions);
  }

}

/** Point on the page or within an element. */
interface Point {
  x: number;
  y: number;
}

/**
 * Gets a 3d `transform` that can be applied to an element.
 * @param x Desired position of the element along the X axis.
 * @param y Desired position of the element along the Y axis.
 */
function getTransform(x: number, y: number): string {
  // Round the transforms since some browsers will
  // blur the elements for sub-pixel transforms.
  return `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

/** Creates a deep clone of an element. */
// function deepCloneNode(node: HTMLElement): HTMLElement {
//   const clone = node.cloneNode(true) as HTMLElement;
//   // Remove the `id` to avoid having multiple elements with the same id on the page.
//   clone.removeAttribute('id');
//   return clone;
// }

/**
 * Helper to remove an element from the DOM and to do all the necessary null checks.
 * @param element Element to be removed.
 */
function removeElement(element: HTMLElement | null) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

/** Determines whether an event is a touch event. */
function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return event.type.startsWith('touch');
}
