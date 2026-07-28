import React, { useRef, useState, useEffect } from 'react';

export default function MobileControls({ joystickRef, onAttack }) {
  const baseRef = useRef(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef(null);

  // Handle joystick touch
  const handleTouchStart = (e) => {
    // Only track one touch for the joystick
    if (touchIdRef.current !== null) return;
    
    // Find the touch that started on the base
    const touch = Array.from(e.changedTouches).find(t => 
      baseRef.current && baseRef.current.contains(t.target)
    );
    
    if (touch) {
      touchIdRef.current = touch.identifier;
      updateJoystick(touch);
    }
  };

  const handleTouchMove = (e) => {
    if (touchIdRef.current === null) return;
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
    if (touch) {
      updateJoystick(touch);
      // Prevent default scrolling when dragging joystick
      e.preventDefault(); 
    }
  };

  const handleTouchEnd = (e) => {
    if (touchIdRef.current === null) return;
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
    if (touch) {
      touchIdRef.current = null;
      setKnobPos({ x: 0, y: 0 });
      if (joystickRef) joystickRef.current = { dx: 0, dy: 0 };
    }
  };

  const updateJoystick = (touch) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const maxDist = rect.width / 2;
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    
    setKnobPos({ x: dx, y: dy });
    
    // Normalize to [-1, 1] for the game loop
    if (joystickRef) {
      joystickRef.current = { 
        dx: dx / maxDist, 
        dy: dy / maxDist 
      };
    }
  };

  // Add event listeners non-passively for preventDefault to work
  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;
    
    const onMove = (e) => handleTouchMove(e);
    
    base.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      base.removeEventListener('touchmove', onMove);
    };
  }, []);

  return (
    <div className="mobile-controls">
      {/* Joystick Area */}
      <div 
        className="joystick-zone"
        ref={baseRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="joystick-base">
          <div 
            className="joystick-knob" 
            style={{ transform: `translate(calc(-50% + ${knobPos.x}px), calc(-50% + ${knobPos.y}px))` }}
          />
        </div>
      </div>

      {/* Attack Area */}
      <div className="attack-btn-zone">
        <button 
          className="attack-btn"
          onTouchStart={(e) => {
            e.preventDefault();
            onAttack();
          }}
        >
          ⚔️
        </button>
      </div>
    </div>
  );
}
