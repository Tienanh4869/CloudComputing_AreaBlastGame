// src/components/MobileControls.jsx — Ergonomic touch controls for mobile devices
import React, { useRef, useState, useEffect, useCallback } from 'react';

export default function MobileControls({ joystickRef, onAttack }) {
  const baseRef = useRef(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isAttacking, setIsAttacking] = useState(false);
  const activePointerIdRef = useRef(null);

  // Check if touch device / mobile screen
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

  const updateJoystickPos = useCallback((clientX, clientY) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const maxRadius = rect.width / 2;
    let dx = clientX - centerX;
    let dy = clientY - centerY;

    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobPos({ x: dx, y: dy });

    // Normalize to [-1, 1] with deadzone
    if (joystickRef) {
      const ratio = dist / maxRadius;
      if (ratio < 0.08) {
        joystickRef.current = { dx: 0, dy: 0 };
      } else {
        joystickRef.current = {
          dx: dx / maxRadius,
          dy: dy / maxRadius,
        };
      }
    }
  }, [joystickRef]);

  const resetJoystick = useCallback(() => {
    activePointerIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    if (joystickRef) {
      joystickRef.current = { dx: 0, dy: 0 };
    }
  }, [joystickRef]);

  // Pointer event handlers (Handles both Touch & Mouse smoothly)
  const handlePointerDown = (e) => {
    e.stopPropagation();
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    updateJoystickPos(e.clientX, e.clientY);
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const handlePointerMove = (e) => {
    if (activePointerIdRef.current === null) return;
    if (e.pointerId !== activePointerIdRef.current) return;
    e.stopPropagation();
    updateJoystickPos(e.clientX, e.clientY);
  };

  const handlePointerUp = (e) => {
    if (activePointerIdRef.current === e.pointerId) {
      e.stopPropagation();
      resetJoystick();
    }
  };

  // Window blur / safety cleanup
  useEffect(() => {
    const handleGlobalCancel = () => resetJoystick();
    window.addEventListener('blur', handleGlobalCancel);
    window.addEventListener('pointercancel', handleGlobalCancel);
    return () => {
      window.removeEventListener('blur', handleGlobalCancel);
      window.removeEventListener('pointercancel', handleGlobalCancel);
    };
  }, [resetJoystick]);

  const handleAttackStart = (e) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    setIsAttacking(true);
    if (navigator.vibrate) navigator.vibrate(15);
    onAttack?.();
  };

  const handleAttackEnd = (e) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    setIsAttacking(false);
  };

  if (!isTouchDevice) return null;

  return (
    <div className="mobile-controls-layer" style={{ pointerEvents: 'none' }}>
      {/* Movement Joystick (Bottom-Left) */}
      <div
        className="joystick-zone"
        ref={baseRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
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
      <div className="attack-btn-zone" style={{ pointerEvents: 'auto', touchAction: 'none' }}>
        <button
          className={`attack-btn ${isAttacking ? 'active' : ''}`}
          onPointerDown={handleAttackStart}
          onPointerUp={handleAttackEnd}
          onPointerCancel={handleAttackEnd}
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
