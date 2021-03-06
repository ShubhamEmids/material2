import {
  AfterContentInit,
  Component,
  ContentChildren,
  ElementRef,
  Host,
  HostBinding,
  HostListener,
  Input,
  Optional,
  Output,
  QueryList,
  Type,
  ChangeDetectionStrategy
} from 'angular2/core';
import {PromiseWrapper, ObservableWrapper, EventEmitter} from 'angular2/src/facade/async';
import {iterateListLike} from 'angular2/src/facade/collection';
import {BaseException} from 'angular2/src/facade/exceptions';
import {CONST_EXPR, isPresent} from 'angular2/src/facade/lang';
import {Dir} from '../../core/rtl/dir';
import {OneOf} from '../../core/annotations/one-of';


/**
 * Exception thrown when a MdSidenavLayout is missing both sidenavs.
 */
export class MdMissingSidenavException extends BaseException {}

/**
 * Exception thrown when two MdSidenav are matching the same side.
 */
export class MdDuplicatedSidenavException extends BaseException {
  constructor(align: string) {
    super(`A sidenav was already declared for 'align="${align}"'`);
  }
}


/**
 * <md-sidenav> component.
 *
 * This component corresponds to the drawer of the sidenav.
 *
 * Please refer to README.md for examples on how to use it.
 */
@Component({
  selector: 'md-sidenav',
  template: '<ng-content></ng-content>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MdSidenav {
  /** Alignment of the sidenav (direction neutral); whether 'start' or 'end'. */
  @Input() @OneOf(['start', 'end']) align: string = 'start';

  /** Mode of the sidenav; whether 'over' or 'side'. */
  @Input() @OneOf(['over', 'push', 'side']) mode: string = 'over';

  /** Whether the sidenav is opened. */
  @Input('opened') private _opened: boolean;

  /** Event emitted when the sidenav is being opened. Use this to synchronize animations. */
  @Output('open-start') onOpenStart = new EventEmitter<Object>();

  /** Event emitted when the sidenav is fully opened. */
  @Output('open') onOpen = new EventEmitter<Object>();

  /** Event emitted when the sidenav is being closed. Use this to synchronize animations. */
  @Output('close-start') onCloseStart = new EventEmitter<Object>();

  /** Event emitted when the sidenav is fully closed. */
  @Output('close') onClose = new EventEmitter<Object>();


  /**
   * @param _elementRef The DOM element reference. Used for transition and width calculation.
   *     If not available we do not hook on transitions.
   */
  constructor(private _elementRef: ElementRef) {}

  /**
   * Whether the sidenav is opened. We overload this because we trigger an event when it
   * starts or end.
   */
  get opened(): boolean { return this._opened; }
  set opened(v: boolean) {
    this.toggle(v);
  }


  /** Open this sidenav, and return a Promise that will resolve when it's fully opened (or get
   * rejected if it didn't). */
  open(): Promise<void> {
    return this.toggle(true);
  }

  /**
   * Close this sidenav, and return a Promise that will resolve when it's fully closed (or get
   * rejected if it didn't).
   */
  close(): Promise<void> {
    return this.toggle(false);
  }

  /**
   * Toggle this sidenav. This is equivalent to calling open() when it's already opened, or
   * close() when it's closed.
   * @param isOpen
   */
  toggle(isOpen?: boolean): Promise<void> {
    if (!isPresent(isOpen)) {
      isOpen = !this.opened;
    }
    // Shortcut it if we're already opened.
    if (isOpen === this.opened) {
      if (!this._transition) {
        return PromiseWrapper.resolve(null);
      } else {
        return isOpen ? this._openPromise : this._closePromise;
      }
    }

    this._opened = isOpen;
    this._transition = true;

    if (isOpen) {
      this.onOpenStart.emit(null);
    } else {
      this.onCloseStart.emit(null);
    }

    if (isOpen) {
      if (this._openPromise == null) {
        let completer = PromiseWrapper.completer();
        this._openPromise = completer.promise;
        this._openPromiseReject = completer.reject;
        this._openPromiseResolve = completer.resolve;
      }
      return this._openPromise;
    } else {
      if (this._closePromise == null) {
        let completer = PromiseWrapper.completer();
        this._closePromise = completer.promise;
        this._closePromiseReject = completer.reject;
        this._closePromiseResolve = completer.resolve;
      }
      return this._closePromise;
    }
  }


  /**
   * When transition has finished, set the internal state for classes and emit the proper event.
   * The event passed is actually of type TransitionEvent, but that type is not available in
   * Android so we use any.
   * @param e The event.
   * @private
   */
  @HostListener('transitionend', ['$event']) onTransitionEnd(e: any) {
    if (e.target == this._elementRef.nativeElement
        // Simpler version to check for prefixes.
        && e.propertyName.endsWith('transform')) {
      this._transition = false;
      if (this._opened) {
        if (this._openPromise != null) {
          this._openPromiseResolve();
        }
        if (this._closePromise != null) {
          this._closePromiseReject();
        }

        this.onOpen.emit(null);
      } else {
        if (this._closePromise != null) {
          this._closePromiseResolve();
        }
        if (this._openPromise != null) {
          this._openPromiseReject();
        }

        this.onClose.emit(null);
      }

      this._openPromise = null;
      this._closePromise = null;
    }
  }

  @HostBinding('class.md-sidenav-closing') private get _isClosing() {
    return !this._opened && this._transition;
  }
  @HostBinding('class.md-sidenav-opening') private get _isOpening() {
    return this._opened && this._transition;
  }
  @HostBinding('class.md-sidenav-closed') private get _isClosed() {
    return !this._opened && !this._transition;
  }
  @HostBinding('class.md-sidenav-opened') private get _isOpened() {
    return this._opened && !this._transition;
  }
  @HostBinding('class.md-sidenav-end') private get _isEnd() {
    return this.align == 'end';
  }
  @HostBinding('class.md-sidenav-side') private get _modeSide() {
    return this.mode == 'side';
  }
  @HostBinding('class.md-sidenav-over') private get _modeOver() {
    return this.mode == 'over';
  }
  @HostBinding('class.md-sidenav-push') private get _modePush() {
    return this.mode == 'push';
  }

  /**
   * This is public because we need it from MdSidenavLayout, but it's undocumented and should
   * not be used outside.
   * @private
   */
  public get _width() {
    if (this._elementRef.nativeElement) {
      return this._elementRef.nativeElement.offsetWidth;
    }
    return 0;
  }

  private _transition: boolean = false;
  private _openPromise: Promise<void>;
  private _openPromiseResolve: () => void;
  private _openPromiseReject: () => void;
  private _closePromise: Promise<void>;
  private _closePromiseResolve: () => void;
  private _closePromiseReject: () => void;
}



/**
 * <md-sidenav-layout> component.
 *
 * This is the parent component to one or two <md-sidenav>s that validates the state internally
 * and coordinate the backdrop and content styling.
 */
@Component({
  selector: 'md-sidenav-layout',
  // Do not use ChangeDetectionStrategy.OnPush. It does not work for this component because
  // technically it is a sibling of MdSidenav (on the content tree) and isn't updated when MdSidenav
  // changes its state.
  directives: [MdSidenav],
  templateUrl: './components/sidenav/sidenav.html',
  styleUrls: [
    './components/sidenav/sidenav.css',
    './components/sidenav/sidenav-transitions.css',
  ],
})
export class MdSidenavLayout implements AfterContentInit {
  @ContentChildren(MdSidenav) private _sidenavs: QueryList<MdSidenav>;

  get start() { return this._start; }
  get end() { return this._end; }

  constructor(@Optional() @Host() private _dir: Dir) {
    // If a `Dir` directive exists up the tree, listen direction changes and update the left/right
    // properties to point to the proper start/end.
    if (_dir != null) {
      _dir.dirChange.add(() => this._validateDrawers());
    }
  }

  ngAfterContentInit() {
    // On changes, assert on consistency.
    ObservableWrapper.subscribe(this._sidenavs.changes, () => this._validateDrawers());
    this._validateDrawers();
  }


  /** The sidenav at the start/end alignment, independent of direction. */
  private _start: MdSidenav;
  private _end: MdSidenav;

  /**
   * The sidenav at the left/right. When direction changes, these will change as well.
   * They're used as aliases for the above to set the left/right style properly.
   * In LTR, _left == _start and _right == _end.
   * In RTL, _left == _end and _right == _start.
   */
  private _left: MdSidenav;
  private _right: MdSidenav;

  /**
   * Validate the state of the sidenav children components.
   * @private
   */
  private _validateDrawers() {
    this._start = this._end = null;
    if (this._sidenavs.length === 0) {
      throw new MdMissingSidenavException();
    }

    // Ensure that we have at most one start and one end sidenav.
    iterateListLike(this._sidenavs, (sidenav: any) => {
      if (sidenav.align == 'end') {
        if (this._end != null) {
          throw new MdDuplicatedSidenavException('end');
        }
        this._end = sidenav;
      } else {
        if (this._start != null) {
          throw new MdDuplicatedSidenavException('start');
        }
        this._start = sidenav;
      }
    });

    this._right = this._left = null;

    // Detect if we're LTR or RTL.
    if (this._dir == null || this._dir.value == 'ltr') {
      this._left = this._start;
      this._right = this._end;
    } else {
      this._left = this._end;
      this._right = this._start;
    }
  }

  private _closeModalSidenav() {
    if (this._start != null && this._start.mode != 'side') {
      this._start.close();
    }
    if (this._end != null && this._end.mode != 'side') {
      this._end.close();
    }
  }

  private _isShowingBackdrop() {
    return (this._start != null && this._start.mode != 'side' && this._start.opened)
        || (this._end != null && this._end.mode != 'side' && this._end.opened);
  }

  /**
   * Return the width of the sidenav, if it's in the proper mode and opened.
   * This may relayout the view, so do not call this often.
   * @param MdSidenav
   * @private
   */
  private _getSidenavEffectiveWidth(sidenav: MdSidenav, mode: string): number {
    if (sidenav != null && sidenav.mode == mode && sidenav.opened) {
      return sidenav._width;
    }
    return 0;
  }

  private _getMarginLeft() {
    return this._getSidenavEffectiveWidth(this._left, 'side');
  }

  private _getMarginRight() {
    return this._getSidenavEffectiveWidth(this._right, 'side');
  }

  private _getPositionLeft() {
    return this._getSidenavEffectiveWidth(this._left, 'push');
  }

  private _getPositionRight() {
    return this._getSidenavEffectiveWidth(this._right, 'push');
  }
}


export const MD_SIDENAV_DIRECTIVES: Type[] = CONST_EXPR([MdSidenavLayout, MdSidenav]);
