/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

// import {Directionality} from '@angular/cdk/bidi';
// import {ViewportRuler} from '@angular/cdk/scrolling';
// import {DOCUMENT} from '@angular/common';
import {
  AfterViewInit,
  // ContentChild,
  // ContentChildren,
  Directive,
  ElementRef,
  // EventEmitter,
  // Inject,
  // InjectionToken,
  // Input,
  // NgZone,
  OnDestroy,
  // Optional,
  // Output,
  // QueryList,
  // SkipSelf,
  // ViewContainerRef,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
// import {coerceBooleanProperty} from '@angular/cdk/coercion';
import {
  // Observable,
  // Observer,
  Subject,
  // merge
} from 'rxjs';
// import {startWith, take, map, takeUntil, switchMap, tap} from 'rxjs/operators';
// import {DragDropRegistry} from '../drag-drop-registry';
// import {
//   CdkDragDrop,
//   CdkDragEnd,
//   CdkDragEnter,
//   CdkDragExit,
//   CdkDragMove,
//   CdkDragStart,
//   CdkDragRelease,
// } from '../drag-events';
// import {CdkDragHandle} from './drag-handle';
// import {CdkDragPlaceholder} from './drag-placeholder';
// import {CdkDragPreview} from './drag-preview';
// import {CDK_DROP_LIST} from '../drop-list-container';
// import {CDK_DRAG_PARENT} from '../drag-parent';
import {
  DragRef,
  // DragRefConfig
} from '../drag-ref';
// import {DropListRef} from '../drop-list-ref';
// import {CdkDropListInternal as CdkDropList} from './drop-list';
// import {DragDrop} from '../drag-drop';

/** Element that can be moved inside a CdkDropList container. */
@Directive({
  selector: '[cdkResize]',
  exportAs: 'cdkResize',
  host: {
    'class': 'cdk-resize',
    // '[class.cdk-resize-resizing]': '_dragRef.isDragging()',
  },
  // providers: [{provide: CDK_DRAG_PARENT, useExisting: CdkResize}]
})
export class CdkResize<T = any> implements AfterViewInit, OnChanges, OnDestroy {
  private _destroyed = new Subject<void>();

  /** Reference to the underlying drag instance. */
  _dragRef: DragRef<CdkResize<T>>;


  constructor(
    /** Element that the draggable is attached to. */
    public element: ElementRef<HTMLElement>
    ) {
      console.log({element});
  }

  /**
   * Returns the element that is being used as a placeholder
   * while the current element is being dragged.
   */
  getPlaceholderElement(): HTMLElement {
    return this._dragRef.getPlaceholderElement();
  }

  /** Returns the root draggable element. */
  getRootElement(): HTMLElement {
    return this._dragRef.getRootElement();
  }

  /** Resets a standalone drag item to its initial position. */
  reset(): void {
    this._dragRef.reset();
  }

  ngAfterViewInit() {

  }

  ngOnChanges(changes: SimpleChanges) {
    console.log({changes});
  }

  ngOnDestroy() {
    this._destroyed.next();
    this._destroyed.complete();
    this._dragRef.dispose();
  }
}
