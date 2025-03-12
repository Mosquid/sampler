// Variables
let audioContext;
let recorder;
let audioBuffer = null;
let recordingStream = null;
let isRecording = false;
let recordingStartTime = 0;
let isPlaying = false;
let playbackSource = null;
let playbackStartTime = 0;
let animationFrameId = null;

// UI Elements
const recordBtn = document.getElementById("recordBtn");
const playBtn = document.getElementById("playBtn");
const clearBtn = document.getElementById("clearBtn");
const timeDisplay = document.getElementById("timeDisplay");
const waveform = document.getElementById("waveform");
const waveformDisplay = document.getElementById("waveformDisplay");
const keyBindings = document.getElementById("keyBindings");
const playPauseBtn = document.getElementById("playPauseBtn");
const currentTimeDisplay = document.getElementById("currentTimeDisplay");
const totalTimeDisplay = document.getElementById("totalTimeDisplay");
const playhead = document.getElementById("playhead");

playPauseBtn.addEventListener("click", togglePlayPause);

// Waveform context
const waveformCtx = waveformDisplay.getContext("2d");

// Recording data
let audioChunks = [];
let slices = [];
let keyMappings = {};
let activeSlices = {};

// Key mapping - Available keys to assign
const availableKeys = [
  "q",
  "w",
  "e",
  "r",
  "t",
  "y",
  "u",
  "i",
  "o",
  "p",
  "a",
  "s",
  "d",
  "f",
  "g",
  "h",
  "j",
  "k",
  "l",
  "z",
  "x",
  "c",
  "v",
  "b",
  "n",
  "m",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
];
let nextKeyIndex = 0;

// Initialize canvas size
function initCanvas() {
  waveformDisplay.width = waveform.clientWidth;
  waveformDisplay.height = waveform.clientHeight;
}

// Format time as MM:SS.mmm
function formatTime(timeInSeconds) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const milliseconds = Math.floor((timeInSeconds % 1) * 1000);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}.${String(milliseconds).padStart(3, "0")}`;
}

// Draw waveform
function drawWaveform() {
  if (!audioBuffer) return;

  const width = waveformDisplay.width;
  const height = waveformDisplay.height;
  const channelData = audioBuffer.getChannelData(0);
  const step = Math.ceil(channelData.length / width);

  waveformCtx.clearRect(0, 0, width, height);
  waveformCtx.beginPath();
  waveformCtx.moveTo(0, height / 2);

  // Draw the center line
  waveformCtx.strokeStyle = "#ddd";
  waveformCtx.lineWidth = 1;
  waveformCtx.beginPath();
  waveformCtx.moveTo(0, height / 2);
  waveformCtx.lineTo(width, height / 2);
  waveformCtx.stroke();

  // Draw the waveform
  waveformCtx.strokeStyle = "#3498db";
  waveformCtx.lineWidth = 2;
  waveformCtx.beginPath();

  for (let i = 0; i < width; i++) {
    const dataIndex = i * step;
    let min = 1.0;
    let max = -1.0;

    // Find min and max in this segment
    for (let j = 0; j < step; j++) {
      if (dataIndex + j < channelData.length) {
        const value = channelData[dataIndex + j];
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    const y1 = ((min + 1) / 2) * height;
    const y2 = ((max + 1) / 2) * height;

    waveformCtx.moveTo(i, y1);
    waveformCtx.lineTo(i, y2);
  }

  waveformCtx.stroke();

  // Draw slice regions
  drawSliceRegions();
}

// Draw slice regions
function drawSliceRegions() {
  // First, remove all existing DOM markers
  document.querySelectorAll(".slice-region").forEach((el) => el.remove());

  // Draw all slice regions
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const startPx =
      (slice.start / audioBuffer.duration) * waveformDisplay.width;
    const endPx = (slice.end / audioBuffer.duration) * waveformDisplay.width;
    const width = endPx - startPx;

    const region = document.createElement("div");
    region.className = "slice-region";
    region.style.left = `${startPx}px`;
    region.style.width = `${width}px`;
    region.dataset.index = i;
    region.title = `${slice.key.toUpperCase()}: ${formatTime(
      slice.start
    )} - ${formatTime(slice.end)}`;
    waveform.appendChild(region);

    // Make region draggable for repositioning
    region.addEventListener("mousedown", (e) => {
      // Prevent selecting this region again when trying to drag it
      e.stopPropagation();
      startDragRegion(e, i);
    });
  }
}

// Start dragging a region
function startDragRegion(e, index) {
  const region = e.target;
  const slice = slices[index];
  const initialX = e.clientX;
  const initialLeft = parseFloat(region.style.left);
  const regionWidth = parseFloat(region.style.width);
  const maxRight = waveformDisplay.width;

  function moveRegion(e) {
    const dx = e.clientX - initialX;
    let newLeft = initialLeft + dx;

    // Ensure region stays within bounds
    if (newLeft < 0) newLeft = 0;
    if (newLeft + regionWidth > maxRight) newLeft = maxRight - regionWidth;

    // Update region position
    region.style.left = `${newLeft}px`;

    // Update slice times
    const newStart = (newLeft / waveformDisplay.width) * audioBuffer.duration;
    const newEnd =
      ((newLeft + regionWidth) / waveformDisplay.width) * audioBuffer.duration;

    slice.start = newStart;
    slice.end = newEnd;

    region.title = `${slice.key.toUpperCase()}: ${formatTime(
      slice.start
    )} - ${formatTime(slice.end)}`;
  }

  function stopDragRegion() {
    document.removeEventListener("mousemove", moveRegion);
    document.removeEventListener("mouseup", stopDragRegion);
    updateKeyBindings();
  }

  document.addEventListener("mousemove", moveRegion);
  document.addEventListener("mouseup", stopDragRegion);
  e.preventDefault();
}

// Process audio data
async function processAudio(audioData) {
  const arrayBuffer = await audioData.arrayBuffer();
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  drawWaveform();
  playBtn.disabled = false;
  playPauseBtn.disabled = false;

  // Update total time display
  totalTimeDisplay.textContent = formatTime(audioBuffer.duration);
  currentTimeDisplay.textContent = formatTime(0);
}

// Selection variables
let isSelecting = false;
let selectionStart = 0;
let selectionEnd = 0;
let selectionOverlay = null;

// Handle mouse down for region selection
function handleMouseDown(e) {
  if (!audioBuffer) return;

  const rect = waveform.getBoundingClientRect();
  const x = e.clientX - rect.left;
  selectionStart = (x / waveformDisplay.width) * audioBuffer.duration;

  // Create selection overlay
  selectionOverlay = document.createElement("div");
  selectionOverlay.className = "selection-overlay";
  selectionOverlay.style.left = `${x}px`;
  selectionOverlay.style.width = "0px";
  waveform.appendChild(selectionOverlay);

  isSelecting = true;

  // Add event listeners for mouse move and up
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  e.preventDefault();
}

// Handle mouse move for region selection
function handleMouseMove(e) {
  if (!isSelecting || !audioBuffer) return;

  const rect = waveform.getBoundingClientRect();
  const x = e.clientX - rect.left;
  selectionEnd = (x / waveformDisplay.width) * audioBuffer.duration;

  // Ensure selection stays within bounds
  if (selectionEnd < 0) selectionEnd = 0;
  if (selectionEnd > audioBuffer.duration) selectionEnd = audioBuffer.duration;

  // Update selection overlay
  const startPx =
    (Math.min(selectionStart, selectionEnd) / audioBuffer.duration) *
    waveformDisplay.width;
  const endPx =
    (Math.max(selectionStart, selectionEnd) / audioBuffer.duration) *
    waveformDisplay.width;
  const width = endPx - startPx;

  selectionOverlay.style.left = `${startPx}px`;
  selectionOverlay.style.width = `${width}px`;
}

// Handle mouse up for region selection
function handleMouseUp(e) {
  if (!isSelecting || !audioBuffer) {
    isSelecting = false;
    return;
  }

  const rect = waveform.getBoundingClientRect();
  const x = e.clientX - rect.left;
  selectionEnd = (x / waveformDisplay.width) * audioBuffer.duration;

  // Remove selection overlay
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }

  // Calculate the start and end times
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);

  // If the selection is too small, ignore it
  if (end - start < 0.1) {
    isSelecting = false;
    return;
  }

  // Add a new slice
  addSlice(start, end);

  // Remove event listeners
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);

  isSelecting = false;
}

// Add a slice to the collection
function addSlice(start, end) {
  // Assign a key to the new slice
  const key = availableKeys[nextKeyIndex % availableKeys.length];
  nextKeyIndex++;

  // Create the slice
  slices.push({
    start: start,
    end: end,
    key: key,
  });

  // Update mappings
  keyMappings[key] = slices.length - 1;

  // Update UI
  drawSliceRegions();
  updateKeyBindings();
}

// Create slices from markers
function updateSlices() {
  slices = [];

  // If there are no markers, the entire recording is one slice
  if (sliceMarkers.length === 0 && audioBuffer) {
    slices.push({
      start: 0,
      end: audioBuffer.duration,
      key: getNextAvailableKey(),
    });
    return;
  }

  // First slice: from beginning to first marker
  if (sliceMarkers.length > 0) {
    slices.push({
      start: 0,
      end: sliceMarkers[0],
      key: availableKeys[0],
    });
  }

  // Middle slices: between markers
  for (let i = 0; i < sliceMarkers.length - 1; i++) {
    slices.push({
      start: sliceMarkers[i],
      end: sliceMarkers[i + 1],
      key: availableKeys[(i + 1) % availableKeys.length],
    });
  }

  // Last slice: from last marker to end
  if (sliceMarkers.length > 0 && audioBuffer) {
    slices.push({
      start: sliceMarkers[sliceMarkers.length - 1],
      end: audioBuffer.duration,
      key: availableKeys[sliceMarkers.length % availableKeys.length],
    });
  }

  // Update key mappings
  keyMappings = {};
  slices.forEach((slice, index) => {
    keyMappings[slice.key] = index;
  });
}

// Get next available key
function getNextAvailableKey() {
  return availableKeys[nextKeyIndex++ % availableKeys.length];
}

// Update key bindings display
function updateKeyBindings() {
  keyBindings.innerHTML = "";

  slices.forEach((slice, index) => {
    const keyBind = document.createElement("div");
    keyBind.className = "key-bind";
    keyBind.dataset.index = index;
    keyBind.innerHTML = `
          <span class="key">${slice.key.toUpperCase()}</span>
          <span class="time">${formatTime(slice.start)} - ${formatTime(
      slice.end
    )}</span>
        `;

    keyBind.addEventListener("click", () => {
      playSlice(index);
    });

    keyBindings.appendChild(keyBind);
  });
}

// Play a slice
function playSlice(index) {
  if (!audioBuffer || !audioContext) return;

  const slice = slices[index];
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  // Calculate start and end times
  const startTime = slice.start;
  const duration = slice.end - slice.start;

  // Play the slice
  source.start(0, startTime, duration);

  // Update UI
  const keyBind = document.querySelector(`.key-bind[data-index="${index}"]`);
  if (keyBind) {
    keyBind.classList.add("active");
    setTimeout(() => {
      keyBind.classList.remove("active");
    }, duration * 1000);
  }

  // Store reference to active slice
  activeSlices[index] = {
    source,
    endTime: audioContext.currentTime + duration,
  };

  // Remove reference when done playing
  setTimeout(() => {
    delete activeSlices[index];
  }, duration * 1000);
}

// Play/pause recording
function togglePlayPause() {
  if (!audioBuffer) return;

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (isPlaying) {
    // Pause playback
    stopPlayback();
  } else {
    // Start playback
    startPlayback();
  }
}

// Start playback
function startPlayback() {
  if (!audioBuffer || !audioContext) return;

  // Create a new source
  playbackSource = audioContext.createBufferSource();
  playbackSource.buffer = audioBuffer;
  playbackSource.connect(audioContext.destination);

  // Start playback
  playbackSource.start();
  playbackStartTime = audioContext.currentTime;

  // Update UI
  isPlaying = true;
  playPauseBtn.classList.add("playing");

  // Start animation
  updatePlayhead();

  // Set up ended callback
  playbackSource.onended = stopPlayback;
}

// Stop playback
function stopPlayback() {
  if (playbackSource) {
    try {
      playbackSource.stop();
    } catch (e) {
      // Ignore errors if already stopped
    }
    playbackSource = null;
  }

  // Update UI
  isPlaying = false;
  playPauseBtn.classList.remove("playing");

  // Stop animation
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// Update playhead position
function updatePlayhead() {
  if (!isPlaying || !audioBuffer || !audioContext) return;

  const currentTime = audioContext.currentTime - playbackStartTime;

  if (currentTime <= audioBuffer.duration) {
    // Update time display
    currentTimeDisplay.textContent = formatTime(currentTime);

    // Update playhead position
    const position =
      (currentTime / audioBuffer.duration) * waveformDisplay.width;
    playhead.style.left = `${position}px`;
    playhead.style.display = "block";

    // Continue animation
    animationFrameId = requestAnimationFrame(updatePlayhead);
  } else {
    // Playback ended
    stopPlayback();
    currentTimeDisplay.textContent = formatTime(0);
    playhead.style.display = "none";
  }
}

// Play full recording (legacy function for compatibility)
function playFullRecording() {
  togglePlayPause();
}

// Start recording
async function startRecording() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    recorder = new MediaRecorder(recordingStream);
    audioChunks = [];

    recorder.addEventListener("dataavailable", (e) => {
      audioChunks.push(e.data);
    });

    recorder.addEventListener("stop", async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      await processAudio(audioBlob);
      recordingStream.getTracks().forEach((track) => track.stop());
      recordingStream = null;
    });

    recorder.start();
    isRecording = true;
    recordingStartTime = audioContext.currentTime;
    recordBtn.classList.add("recording");
    recordBtn.textContent = "Stop Recording";

    // Start time display update
    updateTimeDisplay();
  } catch (error) {
    console.error("Error starting recording:", error);
    alert(
      "Could not access microphone. Please ensure you have given permission."
    );
  }
}

// Stop recording
function stopRecording() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
    isRecording = false;
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "Record";
  }
}

// Update time display during recording
function updateTimeDisplay() {
  if (isRecording && audioContext) {
    const currentTime = audioContext.currentTime - recordingStartTime;
    timeDisplay.textContent = formatTime(currentTime);
    requestAnimationFrame(updateTimeDisplay);
  } else if (audioBuffer) {
    timeDisplay.textContent = formatTime(audioBuffer.duration);
  } else {
    timeDisplay.textContent = "00:00.000";
  }
}

// Clear everything
function clearAll() {
  audioBuffer = null;
  slices = [];
  keyMappings = {};
  activeSlices = {};
  nextKeyIndex = 0;

  // Stop any playing audio
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  // Clear waveform
  waveformCtx.clearRect(0, 0, waveformDisplay.width, waveformDisplay.height);

  // Remove all regions
  document.querySelectorAll(".slice-region").forEach((el) => el.remove());

  // Clear key bindings
  keyBindings.innerHTML = "";

  // Reset buttons and displays
  playBtn.disabled = true;
  playPauseBtn.disabled = true;
  timeDisplay.textContent = "00:00.000";
  currentTimeDisplay.textContent = "00:00.000";
  totalTimeDisplay.textContent = "00:00.000";
  playhead.style.display = "none";
}

// Clear slice selections only (keep audio)
function clearSelections() {
  slices = [];
  keyMappings = {};
  activeSlices = {};
  nextKeyIndex = 0;

  // Stop any playing audio sources
  Object.values(activeSlices).forEach((slice) => {
    if (slice.source) {
      try {
        slice.source.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
    }
  });

  // Remove all regions
  document.querySelectorAll(".slice-region").forEach((el) => el.remove());

  // Clear key bindings
  keyBindings.innerHTML = "";
}

// Handle keyboard events
function handleKeyDown(e) {
  const key = e.key.toLowerCase();
  if (keyMappings.hasOwnProperty(key)) {
    const sliceIndex = keyMappings[key];
    playSlice(sliceIndex);
    e.preventDefault();
  }
}

// Initialize
window.addEventListener("load", () => {
  initCanvas();

  // Event listeners
  recordBtn.addEventListener("click", () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  playBtn.addEventListener("click", playFullRecording);
  clearBtn.addEventListener("click", clearAll);
  waveform.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", () => {
    initCanvas();
    drawWaveform();
  });
});
