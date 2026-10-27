import { EXPERIENCE_STATES, INTERACTION_CONFIG } from '../config.js';

export class PointerInteractionController {
  constructor({
    canvas,
    cameraController,
    picker,
    interactivePicker,
    getEchoHitDistance = () => Infinity,
    isEchoOnly = () => false,
    pickPacificCreature = () => null,
    pickPacificParticle = () => null,
    onPacificCreature = () => {},
    onPacificParticle = () => {},
    onPacificBackground = () => {},
    onCharacter,
    onEcho = () => {},
    onInteractiveObject,
    pickArchivePhoto = () => null,
    onArchivePhoto = () => {},
    onInteractiveBackground,
    onPointerPosition = () => {},
  }) {
    this.canvas = canvas;
    this.cameraController = cameraController;
    this.picker = picker;
    this.onCharacter = onCharacter;
    this.onEcho = onEcho;
    this.interactivePicker = interactivePicker;
    this.getEchoHitDistance = getEchoHitDistance;
    this.isEchoOnly = isEchoOnly;
    this.pickPacificCreature = pickPacificCreature;
    this.pickPacificParticle = pickPacificParticle;
    this.onPacificCreature = onPacificCreature;
    this.onPacificParticle = onPacificParticle;
    this.onPacificBackground = onPacificBackground;
    this.onInteractiveObject = onInteractiveObject;
    this.pickArchivePhoto = pickArchivePhoto;
    this.onArchivePhoto = onArchivePhoto;
    this.onInteractiveBackground = onInteractiveBackground;
    this.onPointerPosition = onPointerPosition;
    this.active = null;

    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onPointerCancel = this.handlePointerCancel.bind(this);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
  }

  handlePointerDown(event) {
    if (event.button !== 0 || !event.isPrimary) return;
    const state = this.cameraController.state;
    if (![
      EXPERIENCE_STATES.ECHO_ORBIT,
      EXPERIENCE_STATES.CHARACTER_FOCUS,
      EXPERIENCE_STATES.GROUP_DANCE_FOCUS,
      EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS,
    ].includes(state)) return;
    if (this.isEchoOnly()) {
      const pacificParticle = this.pickPacificParticle?.(event.clientX, event.clientY) ?? null;
      const pacificCreature = pacificParticle ? null
        : this.pickPacificCreature?.(event.clientX, event.clientY) ?? null;
      const echoDistance = this.getEchoHitDistance(event.clientX, event.clientY);
      this.active = {
        id: event.pointerId, startX: event.clientX, startY: event.clientY,
        lastX: event.clientX, lastY: event.clientY, state,
        pacificParticle, pacificCreature,
        echo: !pacificParticle && !pacificCreature && Number.isFinite(echoDistance), longPressed: false,
      };
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic QA pointers and older embedded browsers may not expose capture.
      }
      return;
    }
    const archivePhoto = [EXPERIENCE_STATES.ECHO_ORBIT, EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS]
      .includes(state)
      ? this.pickArchivePhoto(event.clientX, event.clientY) : null;
    if (archivePhoto) {
      this.active = {
        id: event.pointerId, startX: event.clientX, startY: event.clientY,
        lastX: event.clientX, lastY: event.clientY, state, archivePhoto,
      };
      return;
    }
    let interactiveObject = [
      EXPERIENCE_STATES.ECHO_ORBIT,
      EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS,
    ].includes(state)
      ? this.interactivePicker?.pick(event.clientX, event.clientY)
      : null;
    let character = state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS
      ? null
      : this.picker.pick(event.clientX, event.clientY, false);
    const echoDistance = state === EXPERIENCE_STATES.ECHO_ORBIT
      ? this.getEchoHitDistance(event.clientX, event.clientY)
      : Infinity;
    const kobeObjectHasPriority = interactiveObject?.cameraMode?.startsWith('kobe-');
    if (!kobeObjectHasPriority && echoDistance < Math.min(
      character ? this.picker.lastHitDistance : Infinity,
      interactiveObject ? this.interactivePicker.lastHitDistance : Infinity,
    )) {
      character = null;
      interactiveObject = null;
    }
    if (interactiveObject && character) {
      if (kobeObjectHasPriority) character = null;
      else if (this.picker.lastHitDistance < this.interactivePicker.lastHitDistance) interactiveObject = null;
      else character = null;
    }
    this.active = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      state,
      character,
      echo: Number.isFinite(echoDistance) && !character && !interactiveObject,
      interactiveObject,
      longPressed: false,
    };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic QA pointers and older embedded browsers may not expose capture.
    }
    if (!character && !interactiveObject && !Number.isFinite(echoDistance)
      && state === EXPERIENCE_STATES.ECHO_ORBIT) {
      this.active.timer = window.setTimeout(() => {
        if (!this.active || this.active.id !== event.pointerId) return;
        this.active.longPressed = true;
        this.cameraController.enterFreeRoam();
      }, INTERACTION_CONFIG.longPressThreshold);
    }
  }

  handlePointerMove(event) {
    this.onPointerPosition(event.clientX, event.clientY);
    if (!this.active || this.active.id !== event.pointerId) return;
    const dx = event.clientX - this.active.lastX;
    const dy = event.clientY - this.active.lastY;
    this.active.lastX = event.clientX;
    this.active.lastY = event.clientY;
    if (this.active.longPressed) this.cameraController.updateFreeRoam(dx, dy);
  }

  handlePointerUp(event) {
    const active = this.active;
    if (!active || active.id !== event.pointerId) return;
    this.clearTimer();
    this.active = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (active.longPressed) {
      this.cameraController.exitFreeRoam();
      return;
    }
    const moved = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
    if (this.cameraController.state !== active.state) return;
    if (moved <= INTERACTION_CONFIG.clickMoveTolerance) {
      if (active.pacificParticle) this.onPacificParticle(active.pacificParticle);
      else if (active.pacificCreature) this.onPacificCreature(active.pacificCreature);
      else if (this.isEchoOnly() && !active.echo) this.onPacificBackground();
      else if (active.archivePhoto) this.onArchivePhoto(active.archivePhoto);
      else if (active.interactiveObject) this.onInteractiveObject(active.interactiveObject);
      else if (active.character) this.onCharacter(active.character);
      else if (active.echo) this.onEcho();
      else if ([
        EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS,
        EXPERIENCE_STATES.GROUP_DANCE_FOCUS,
      ].includes(this.cameraController.state)) {
        this.onInteractiveBackground();
      }
    }
  }

  handlePointerCancel(event) {
    if (!this.active || this.active.id !== event.pointerId) return;
    const wasFreeRoam = this.active.longPressed;
    this.clearTimer();
    this.active = null;
    if (wasFreeRoam) this.cameraController.exitFreeRoam();
  }

  clearTimer() {
    if (this.active?.timer) window.clearTimeout(this.active.timer);
  }

  dispose() {
    this.clearTimer();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
  }
}
