// src/components/MobileControls.jsx — Ergonomic touch controls for mobile devices
import React, { useRef, useState, useEffect, useCallback } from 'react';

export default function MobileControls({ joystickRef, onAttack }) {
  const baseRef = useRef(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isAttacking, setIsAttacking] = useState(false);
  const touchIdRef = useRef(null);

  // Check if touch device
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      const hasTouch = (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.innerWidth <= 1024
      );
      setIsTouchDevice(hasTouch);
    };

    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  const updateJoystick = useCallback((touch) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const maxDist = rect.width / 2;
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;

    const dist = Math.hypot(dx, dy);

    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }

    setKnobPos({ x: dx, y: dy });

    // Normalize [-1, 1] for game loop
    if (joystickRef) {
      joystickRef.current = {
        dx: dx / maxDist,
        dy: dy / maxDist,
      };
    }
  }, [joystickRef]);

  // Touch handlers for joystick
  const handleJoystickTouchStart = (e) => {
    if (touchIdRef.current !== null) return;
    const touch = Array.from(e.changedTouches).find((t) =>
      baseRef.current && baseRef.current.contains(t.target)
    );

    if (touch) {
      touchIdRef.current = touch.identifier;
      updateJoystick(touch);
      if (navigator.vibrate) navigator.vibrate(8);
    }
  };

  const handleJoystickTouchMove = useCallback((e) => {
    if (touchIdRef.current === null) return;
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === touchIdRef.current);
    if (touch) {
      updateJoystick(touch);
      if (e.cancelable) e.preventDefault();
    }
  }, [updateJoystick]);

  const handleJoystickTouchEnd = useCallback((e) => {
    if (touchIdRef.current === null) return;
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === touchIdRef.current);
    if (touch) {
      touchIdRef.current = null;
      setKnobPos({ x: 0, y: 0 });
      if (joystickRef) joystickRef.current = { dx: 0, dy: 0 };
    }
  }, [joystickRef]);

  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;

    const onMove = (e) => handleJoystickTouchMove(e);
    const onEnd = (e) => handleJoystickTouchEnd(e);

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [handleJoystickTouchMove, handleJoystickTouchEnd]);

  const handleAttackTouchStart = (e) => {
    if (e.cancelable) e.preventDefault();
    setIsAttacking(true);
    if (navigator.vibrate) navigator.vibrate(15);
    onAttack?.();
  };

  const handleAttackTouchEnd = (e) => {
    if (e.cancelable) e.preventDefault();
    setIsAttacking(false);
  };

  if (!isTouchDevice) return null;

  return (
    <div className="mobile-controls-layer" style={{ pointerEvents: 'none' }}>
      {/* Movement Joystick (Bottom-Left) */}
      <div
        className="joystick-zone"
        ref={baseRef}
        onTouchStart={handleJoystickTouchStart}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="joystick-base">
          {/* Direction indicator dots */}
          <div className="joystick-dir-dot top" />
          <div className="joystick-dir-dot bottom" />
          <div className="joystick-dir-dot left" />
          <div className="joystick-dir-dot right" />

          {/* Knob */}
          <div
            className="joystick-knob"
            style={{
              transform: `translate(calc(-50% + ${knobPos.x}px), calc(-50% + ${knobPos.y}px))`,
            }}
          />
        </div>
      </div>

      {/* Attack Button (Bottom-Right) */}
      <div className="attack-btn-zone" style={{ pointerEvents: 'auto' }}>
        <button
          className={`attack-btn ${isAttacking ? 'active' : ''}`}
          onTouchStart={handleAttackTouchStart}
          onTouchEnd={handleAttackTouchEnd}
          onTouchCancel={handleAttackTouchEnd}
          onMouseDown={() => {
            setIsAttacking(true);
            onAttack?.();
          }}
          onMouseUp={() => setIsAttacking(false)}
          aria-label="Attack"
        >
          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>⚔️</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', marginTop: 2, letterSpacing: 1 }}>
            BLAST
          </span>
        </button>
      </div>
    </div>
  );
}
