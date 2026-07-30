// --- PHYSICS & PID ENGINE STATE ---
let Kp = 12.0;
let Ki = 0.15;
let Kd = 6.0;

let position = 220; // Simulated height (pixels from base)
let velocity = 0;
let targetHeight = 220; // Setpoint
let errorIntegral = 0;
let prevError = 0;

let isLevitating = false;
let isWirelessPower = false;
let isMusicSync = false;
let activePreset = "cyan";

// Drag and drop state
let isDragging = false;
let dragStartY = 0;

// Graph and oscilloscope
const historyData = [];
const maxHistoryPoints = 150;

// Audio visualizer bars
const numBars = 24;
const barHeights = new Array(numBars).fill(4);

// Preset colors map
const colorPresets = {
  cyan: { main: "#06b6d4", glow: "rgba(6, 182, 212, 0.4)" },
  purple: { main: "#a855f7", glow: "rgba(168, 85, 247, 0.4)" },
  indigo: { main: "#6366f1", glow: "rgba(99, 102, 241, 0.4)" },
  sunset: { main: "#f97316", glow: "rgba(249, 115, 22, 0.4)" }
};

document.addEventListener("DOMContentLoaded", () => {
  setupUI();
  startSimulationLoop();
  startOscilloscope();
});

// Setup listeners & default values
function setupUI() {
  // Slayderlarni sozlash
  const kpSlider = document.getElementById("kpSlider");
  const kiSlider = document.getElementById("kiSlider");
  const kdSlider = document.getElementById("kdSlider");
  const heightSlider = document.getElementById("heightSlider");

  kpSlider.addEventListener("input", (e) => {
    Kp = parseFloat(e.target.value);
    document.getElementById("kpValue").textContent = Kp.toFixed(1);
  });

  kiSlider.addEventListener("input", (e) => {
    Ki = parseFloat(e.target.value);
    document.getElementById("kiValue").textContent = Ki.toFixed(2);
  });

  kdSlider.addEventListener("input", (e) => {
    Kd = parseFloat(e.target.value);
    document.getElementById("kdValue").textContent = Kd.toFixed(1);
  });

  heightSlider.addEventListener("input", (e) => {
    targetHeight = parseInt(e.target.value);
    document.getElementById("heightValue").textContent = targetHeight + "px";
  });

  // Toggles
  const levitationToggle = document.getElementById("levitationToggle");
  const wirelessToggle = document.getElementById("wirelessToggle");
  const musicToggle = document.getElementById("musicToggle");

  levitationToggle.addEventListener("change", (e) => {
    isLevitating = e.target.checked;
    document.getElementById("statusDot").className = isLevitating ? "dot active" : "dot";
    document.getElementById("statusText").textContent = isLevitating ? "Levitatsiya Faol" : "Kutish rejimida";
    if (!isLevitating) {
      errorIntegral = 0;
      prevError = 0;
    }
  });

  wirelessToggle.addEventListener("change", (e) => {
    isWirelessPower = e.target.checked;
    updateLampGlow();
  });

  musicToggle.addEventListener("change", (e) => {
    isMusicSync = e.target.checked;
  });

  // Color Presets
  document.querySelectorAll(".color-dot").forEach(dot => {
    dot.addEventListener("click", (e) => {
      document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
      e.target.classList.add("active");
      activePreset = e.target.dataset.color;
      updateLampGlow();
    });
  });

  // Interactive Dragging on the lamp sphere
  const lamp = document.getElementById("physicsLamp");
  const visualizerContainer = document.getElementById("visualizerContainer");

  lamp.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStartY = e.clientY - position;
    lamp.style.transition = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    // Calculate new position bounded inside container height limits
    const rect = visualizerContainer.getBoundingClientRect();
    const relativeY = rect.bottom - e.clientY - 35; // centered sphere offset
    position = Math.max(80, Math.min(relativeY, 400));
    velocity = 0;
    updateLampPosition();
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      lamp.style.transition = "transform 0.1s linear, box-shadow 0.3s ease";
    }
  });
}

// Update the position of the physical sphere in the DOM
function updateLampPosition() {
  const lamp = document.getElementById("physicsLamp");
  // position represents pixels from stand base
  // Stand bottom is at 80px relative. Let's calculate CSS bottom offset
  lamp.style.bottom = `${position}px`;

  // Dynamic induction link calculation
  const wave = document.getElementById("inductionWave");
  if (isWirelessPower && isLevitating) {
    wave.classList.add("active");
    // Change wave height matching the floating gap
    wave.style.height = `${position - 80}px`;
  } else {
    wave.classList.remove("active");
  }
}

// Update lamp color & glow strength based on wireless power status and distance
function updateLampGlow() {
  const lamp = document.getElementById("physicsLamp");
  if (isWirelessPower && position > 80 && position < 320) {
    // Glow depends on height (induction link strength drops with distance)
    const distanceFactor = Math.max(0, 1 - (position - 80) / 200); // 1 at base, 0 far away
    const color = colorPresets[activePreset];
    lamp.style.background = `radial-gradient(circle at 30% 30%, #fff, ${color.main})`;
    lamp.style.boxShadow = `0 0 ${40 * distanceFactor}px ${color.main}, 0 0 ${15 * distanceFactor}px white`;
  } else {
    // Dark/Off state
    lamp.style.background = "#1e293b";
    lamp.style.boxShadow = "none";
  }
}

// PID physics solver loop
function startSimulationLoop() {
  const gravity = 0.8; // Gravity pulling sphere down
  const baseHeight = 80; // Stand physical surface limit
  const magnetCeiling = 450; // Max ceiling limit (stick to magnet)

  setInterval(() => {
    if (isDragging) {
      updateLampGlow();
      return;
    }

    if (isLevitating) {
      // PID Calculations
      const currentError = targetHeight - position;
      errorIntegral += currentError;
      // Anti-windup
      errorIntegral = Math.max(-50, Math.min(errorIntegral, 50));
      const errorDerivative = currentError - prevError;
      
      const pidForce = (Kp * currentError) + (Ki * errorIntegral) + (Kd * errorDerivative);
      prevError = currentError;

      // Physics integration
      const acceleration = (pidForce * 0.01) - gravity;
      velocity += acceleration;
      // Air resistance damping
      velocity *= 0.98;
      position += velocity;

      // Handle failure states (PID tuning out of bounds)
      if (position <= baseHeight) {
        position = baseHeight;
        velocity = 0;
      } else if (position >= magnetCeiling) {
        position = magnetCeiling;
        velocity = 0;
      }
    } else {
      // If levitation is off, pull down by gravity to base
      if (position > baseHeight) {
        velocity -= gravity;
        position += velocity;
      } else {
        position = baseHeight;
        velocity = 0;
      }
    }

    updateLampPosition();
    updateLampGlow();
    updateAudioVisualizer();

    // Push to oscilloscope data history
    historyData.push({ actual: position, target: targetHeight });
    if (historyData.length > maxHistoryPoints) {
      historyData.shift();
    }
  }, 16); // ~60fps
}

// Draw the real-time oscilloscope graphs
function startOscilloscope() {
  const canvas = document.getElementById("oscCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Resize handler
  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    if (historyData.length > 1) {
      const scaleY = (val) => canvas.height - ((val / 450) * canvas.height * 0.8) - 20;
      const stepX = canvas.width / maxHistoryPoints;

      // 1. Draw Target setpoint line (dotted green)
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      historyData.forEach((pt, idx) => {
        const x = idx * stepX;
        const y = scaleY(pt.target);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // 2. Draw Actual Height line (glowing cyan/purple)
      const color = colorPresets[activePreset];
      ctx.strokeStyle = color.main;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color.main;
      ctx.beginPath();
      historyData.forEach((pt, idx) => {
        const x = idx * stepX;
        const y = scaleY(pt.actual);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

// Generate animated audio visualizer frequencies
function updateAudioVisualizer() {
  const barsContainer = document.getElementById("visualizerBars");
  if (!barsContainer) return;

  // If music sync is active, simulate active equalizer waves, else silent line
  for (let i = 0; i < numBars; i++) {
    if (isMusicSync && isLevitating) {
      // Simulate frequency waves
      const factor = Math.sin(Date.now() * 0.005 + i * 0.3) * 15 + 20;
      barHeights[i] = Math.max(4, rand(factor - 8, factor + 8));
    } else {
      // Steady idle line
      barHeights[i] = 4;
    }
  }

  barsContainer.innerHTML = barHeights.map(h => `
    <div class="bar" style="height: ${h}px; background: linear-gradient(180deg, ${colorPresets[activePreset].main}, var(--accent-indigo));"></div>
  `).join("");

  // Subtle physical breathing vibration matching music sync frequencies
  if (isMusicSync && isLevitating && !isDragging) {
    const musicBreathe = Math.sin(Date.now() * 0.01) * 2;
    position += musicBreathe;
  }
}

// Tab navigator helper
window.switchTab = (tabName) => {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.remove("active");
    if (btn.getAttribute("onclick").includes(tabName)) {
      btn.classList.add("active");
    }
  });

  // Switch displayed tab panels
  document.getElementById("pidTab").style.display = tabName === "pid" ? "block" : "none";
  document.getElementById("wirelessTab").style.display = tabName === "wireless" ? "block" : "none";
  document.getElementById("audioTab").style.display = tabName === "audio" ? "block" : "none";
};
