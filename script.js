const canvas = document.getElementById('circuit-canvas');
const ctx = canvas.getContext('2d');

let gates = [];
let inputs = [];
let outputs = [];
let clocks = []; // Array to store clock components and their intervals
let connections = [];
let nextId = 0; // Simple ID generator

// Dragging state
let isDragging = false;
let draggedItem = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Connection state
let isConnecting = false;
let startNode = null;
let potentialWire = null; // To draw wire during connection attempt

// Selection state
let selectedItems = [];
let isSelectingBox = false; // Added for marquee selection
let selectionBoxStartX = 0;
let selectionBoxStartY = 0;
let selectionBoxEndX = 0;
let selectionBoxEndY = 0;
let justFinishedSelectionBox = false; // Added this flag

// Clipboard state
let clipboard = []; // Store copied item data (type, value)

// Custom Components State
let customComponentDefinitions = [];
let customComponentInstances = [];

// Viewport state (for panning and zooming)
let viewOffsetX = 0;
let viewOffsetY = 0;
let viewScale = 1;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;

const GATE_WIDTH = 60;
const GATE_HEIGHT = 40;
const IO_WIDTH = 40;  // Width for Input/Output elements
const IO_HEIGHT = 40; // Height for Input/Output elements
const NODE_RADIUS = 5; // Radius for connection nodes

// Store interval IDs for cleanup
let clockIntervals = new Map(); // Map clock.id -> intervalId

// --- Get UI Elements for Indicators/Controls ---
const zoomLevelSpan = document.getElementById('zoom-level');
const offsetXSpan = document.getElementById('offset-x');
const offsetYSpan = document.getElementById('offset-y');

// --- Button Event Listeners ---
document.getElementById('add-and').addEventListener('click', () => addGate('AND'));
document.getElementById('add-or').addEventListener('click', () => addGate('OR'));
document.getElementById('add-not').addEventListener('click', () => addGate('NOT'));
document.getElementById('add-xor').addEventListener('click', () => addGate('XOR'));
document.getElementById('add-nand').addEventListener('click', () => addGate('NAND'));
document.getElementById('add-nor').addEventListener('click', () => addGate('NOR'));
document.getElementById('add-input').addEventListener('click', addInput);
document.getElementById('add-output').addEventListener('click', addOutput);
document.getElementById('add-clock').addEventListener('click', addClock);
document.getElementById('reset').addEventListener('click', resetCircuit);
document.getElementById('delete-selected').addEventListener('click', deleteSelected);
// Add listeners for new view controls
document.getElementById('zoom-in').addEventListener('click', () => zoom(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoom(1 / 1.2));
document.getElementById('reset-view').addEventListener('click', resetView);
document.getElementById('save-selection').addEventListener('click', saveSelectionAsComponent); // Add listener for save button

// --- Event Handlers ---
canvas.addEventListener('click', handleClick);
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('mouseleave', handleMouseLeave); // Handle mouse leaving canvas
canvas.addEventListener('wheel', handleWheel); // Add wheel listener for zoom
window.addEventListener('keydown', handleKeyDown); // Add keydown listener

// --- Helper: Convert Screen to World Coordinates ---
function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - viewOffsetX) / viewScale,
        y: (screenY - viewOffsetY) / viewScale
    };
}

// --- Helper: Find node near world point ---
function findNodeAt(worldX, worldY) {
    // Include custom components and clocks when searching for nodes
    const allComponents = [...gates, ...inputs, ...outputs, ...clocks, ...customComponentInstances];
    for (const component of allComponents) {
        const nodes = [...(component.inputNodes || []), ...(component.outputNodes || [])];
        for (const node of nodes) {
            // Nodes are drawn relative to world, so check distance in world coords
            const nodeWorldX = node.x; // Node positions are already world coords
            const nodeWorldY = node.y;
            const dist = Math.sqrt((worldX - nodeWorldX)**2 + (worldY - nodeWorldY)**2);
            // Adjust hit radius based on scale for easier clicking when zoomed out?
             const hitRadius = NODE_RADIUS / viewScale + NODE_RADIUS * 0.5; // Make target slightly bigger
            if (dist <= hitRadius) { 
                return node;
            }
        }
    }
    return null;
}

// --- Helper: Find component at world point ---
function findComponentAt(worldX, worldY) {
    // Check custom components first, then gates, then IO, then clocks
    const allComponents = [...customComponentInstances, ...outputs, ...inputs, ...clocks, ...gates];
    for (const component of allComponents) {
        // Component x/y are world coords
        if (
            worldX >= component.x && worldX <= component.x + component.width &&
            worldY >= component.y && worldY <= component.y + component.height
        ) {
            return component;
        }
    }
    return null;
}

function handleClick(event) {
    console.log(`[Click] Fired. justFinishedSelectionBox=${justFinishedSelectionBox}, isDragging=${isDragging}, isConnecting=${isConnecting}, isPanning=${isPanning}`);
    if (justFinishedSelectionBox) {
        console.log('[Click] Flag is true, resetting and returning.');
        justFinishedSelectionBox = false; 
        return; 
    }

    if (isDragging || isConnecting || isPanning) { 
        console.log('[Click] Returning due to other action in progress.');
        return; 
    }
    
    console.log(`[Click] Proceeding. Current selectedItems: ${selectedItems.map(i => i.id).join(', ')}`);
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const worldCoords = screenToWorld(mouseX, mouseY);

    const clickedNode = findNodeAt(worldCoords.x, worldCoords.y);
    if (clickedNode) return; // Ignore clicks on nodes for selection

    const clickedComponent = findComponentAt(worldCoords.x, worldCoords.y);

    // Handle Input Toggle (special case)
    if (clickedComponent && clickedComponent.type === 'INPUT') {
        console.log(`Toggled input: ${clickedComponent.id}`);
        clickedComponent.value = 1 - clickedComponent.value; 
        // Don't change selection if shift-clicking the input
        if (!event.shiftKey) {
             // Clear previous selection and select only this input
            selectedItems = [clickedComponent]; 
            console.log(`Selected: ${clickedComponent.id}`);
        } else {
            // Shift-click toggles selection state for the input
            const index = selectedItems.findIndex(item => item.id === clickedComponent.id);
            if (index > -1) {
                selectedItems.splice(index, 1); // Remove if already selected
                console.log(`Deselected (Shift): ${clickedComponent.id}`);
            } else {
                selectedItems.push(clickedComponent); // Add if not selected
                console.log(`Selected (Shift): ${clickedComponent.id}`);
            }
        }
        drawCircuit();
        simulate();
        return; 
    }

    // Handle General Selection/Deselection
    if (event.shiftKey) {
        // Shift key pressed: Add/Remove from selection
        if (clickedComponent) {
            const index = selectedItems.findIndex(item => item.id === clickedComponent.id);
            if (index > -1) {
                // Already selected, remove it
                selectedItems.splice(index, 1);
                 console.log(`Deselected (Shift): ${clickedComponent.id}`);
            } else {
                // Not selected, add it
                selectedItems.push(clickedComponent);
                 console.log(`Selected (Shift): ${clickedComponent.id}`);
            }
        } 
        // No change if shift-clicking background
    } else {
        // Shift key NOT pressed: Replace selection
        if (clickedComponent) {
            // Select only the clicked component
            selectedItems = [clickedComponent];
             console.log(`Selected: ${clickedComponent.id}`);
        } else {
            // Clicked on background, deselect all
            selectedItems = [];
            console.log('Deselected all');
        }
    }

    drawCircuit();
}

function handleMouseDown(event) {
    justFinishedSelectionBox = false; // Reset flag on any mousedown

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const worldCoords = screenToWorld(mouseX, mouseY);

    // Middle mouse button for panning
    if (event.button === 1) { 
        isPanning = true;
        lastPanX = mouseX;
        lastPanY = mouseY;
        canvas.style.cursor = 'grabbing';
        isDragging = false; // Prevent component drag while panning
        isConnecting = false; // Prevent connection start while panning
        return;
    }

    // Left mouse button (0)
    if (event.button === 0) {
        // 1. Check for clicking on a node to start connection
        const clickedNode = findNodeAt(worldCoords.x, worldCoords.y);
        if (clickedNode && clickedNode.parent.outputNodes.includes(clickedNode)) {
            isConnecting = true;
            startNode = clickedNode;
            // Potential wire coords are in world space initially
            potentialWire = { x1: startNode.x, y1: startNode.y, x2: worldCoords.x, y2: worldCoords.y };
            console.log(`Connection started from: ${startNode.id}`);
            isDragging = false; 
            draggedItem = null;
            drawCircuit();
            return;
        }

        // 2. Check for clicking on a component to start dragging
        const componentToDrag = findComponentAt(worldCoords.x, worldCoords.y);
        if (componentToDrag) {
            // Check if the clicked component is part of the current selection
            const isComponentSelected = selectedItems.some(item => item.id === componentToDrag.id);
            
            // If Shift is NOT pressed and the component is NOT selected, 
            // clear existing selection and select only this one before dragging.
            if (!event.shiftKey && !isComponentSelected) {
                selectedItems = [componentToDrag];
                console.log(`Selected: ${componentToDrag.id} (before drag)`);
                drawCircuit(); // Update visual selection immediately
            }
             // If the clicked component IS selected (or became selected just now), start dragging the whole selection.
             if (selectedItems.some(item => item.id === componentToDrag.id)) { 
                 isDragging = true;
                 draggedItem = componentToDrag; // Still track the specific one clicked for offset calc
                 // We are dragging ALL selectedItems
                 dragOffsetX = worldCoords.x - componentToDrag.x;
                 dragOffsetY = worldCoords.y - componentToDrag.y;
                 console.log(`Dragging started on ${selectedItems.length} items.`);
                 canvas.style.cursor = 'grabbing';
                 return;
             }
        }
        
        // 3. Click on background: Start selection box
        if (!clickedNode && !componentToDrag) {
            console.log('Starting selection box');
            isSelectingBox = true;
            selectionBoxStartX = worldCoords.x;
            selectionBoxStartY = worldCoords.y;
            selectionBoxEndX = worldCoords.x;
            selectionBoxEndY = worldCoords.y;
            // Don't immediately clear selection unless Shift is not held (handled on mouseup)
            isDragging = false;
            isConnecting = false;
            return;
        }
    }
}

function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const worldCoords = screenToWorld(mouseX, mouseY);

    // Handle Panning
    if (isPanning) {
        const dx = mouseX - lastPanX;
        const dy = mouseY - lastPanY;
        viewOffsetX += dx;
        viewOffsetY += dy;
        lastPanX = mouseX;
        lastPanY = mouseY;
        drawCircuit();
        updateStatusIndicators(); // Update indicators while panning
        return;
    }

    // Handle Selection Box Drag
    if (isSelectingBox) {
        selectionBoxEndX = worldCoords.x;
        selectionBoxEndY = worldCoords.y;
        drawCircuit(); // Redraw to show the box updating
        return; // Prevent other actions while drawing box
    }

    // Handle Connecting
    if (isConnecting && startNode) {
        potentialWire.x2 = worldCoords.x; // Update world coords
        potentialWire.y2 = worldCoords.y;
        drawCircuit();
        return;
    }

    // Handle Dragging (now potentially multiple items)
    if (isDragging && draggedItem) { // draggedItem is the one initially clicked
        const currentDraggedItemWorldX = worldCoords.x - dragOffsetX;
        const currentDraggedItemWorldY = worldCoords.y - dragOffsetY;

        // Calculate the delta based on the initially clicked item
        const dx = currentDraggedItemWorldX - draggedItem.x;
        const dy = currentDraggedItemWorldY - draggedItem.y;

        // Apply delta to ALL selected items
        selectedItems.forEach(item => {
            item.x += dx;
            item.y += dy;

            // Check if the item is a custom component instance
            const isCustom = customComponentDefinitions.some(def => def.name === item.type);

            if (isCustom) {
                // Directly update node positions for custom components
                if (item.inputNodes) {
                    item.inputNodes.forEach(node => {
                        node.x += dx;
                        node.y += dy;
                    });
                }
                if (item.outputNodes) {
                    item.outputNodes.forEach(node => {
                        node.x += dx;
                        node.y += dy;
                    });
                }
            } else {
                 // Update node positions for standard components using getNodePositions
                 const nodes = getNodePositions(item);
                 item.inputNodes = nodes.inputs;
                 item.outputNodes = nodes.outputs;
            }

            // Update connections attached to this item (regardless of type)
            connections.forEach(conn => {
                // Use the updated node coordinates directly
                if (conn.startNode.parent === item) {
                    const updatedNode = [...(item.inputNodes || []), ...(item.outputNodes || [])].find(n => n.id === conn.startNode.id);
                    if(updatedNode) {
                        conn.startX = updatedNode.x;
                        conn.startY = updatedNode.y;
                    }
                }
                if (conn.endNode.parent === item) {
                     const updatedNode = [...(item.inputNodes || []), ...(item.outputNodes || [])].find(n => n.id === conn.endNode.id);
                     if(updatedNode) {
                         conn.endX = updatedNode.x;
                         conn.endY = updatedNode.y;
                    }
                }
            });
        });

        drawCircuit();
    }
}

function handleMouseUp(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const worldCoords = screenToWorld(mouseX, mouseY);

    // Stop Panning
    if (isPanning) {
        isPanning = false;
        canvas.style.cursor = 'default';
    }

    // Stop Connecting
    if (isConnecting && startNode) {
        const endNode = findNodeAt(worldCoords.x, worldCoords.y);
        
        // Check if:
        // 1. We found an end node.
        // 2. The start node is an output node.
        // 3. The end node is an input node.
        // 4. They belong to different components.
        // 5. The target input node is not already connected.
        const isValidStart = startNode.parent && startNode.parent.outputNodes && startNode.parent.outputNodes.includes(startNode);
        const isValidEnd = endNode && endNode.parent && endNode.parent.inputNodes && endNode.parent.inputNodes.includes(endNode);
        const differentParents = endNode && startNode.parent !== endNode.parent;
        const endNodeAvailable = isValidEnd && !connections.some(c => c.endNode.id === endNode.id);

        if (isValidStart && isValidEnd && differentParents && endNodeAvailable) {
            // Create the connection
            const newConnection = {
                id: `conn_${startNode.id}_${endNode.id}`,
                startNode: startNode,
                endNode: endNode,
                // Store world coordinates for the line
                startX: startNode.x, 
                startY: startNode.y,
                endX: endNode.x,
                endY: endNode.y
            };
            connections.push(newConnection);
            console.log(`Connection created: ${newConnection.id}`);
            simulate(); // Simulate after successful connection
        } else {
            console.log('Connection cancelled or invalid endpoint.');
            if (isValidEnd && !endNodeAvailable) {
                 console.log('Reason: Target input node is already connected.');
            }
        }
        isConnecting = false;
        startNode = null;
        potentialWire = null;
        drawCircuit(); 
    }

    // Handle End of Selection Box
    if (isSelectingBox) {
        console.log('Finishing selection box');
        const boxX1 = Math.min(selectionBoxStartX, selectionBoxEndX);
        const boxY1 = Math.min(selectionBoxStartY, selectionBoxEndY);
        const boxX2 = Math.max(selectionBoxStartX, selectionBoxEndX);
        const boxY2 = Math.max(selectionBoxStartY, selectionBoxEndY);

        let itemsInBox = [];
        // Include custom components when checking what's inside the selection box
        const allComponents = [...gates, ...inputs, ...outputs, ...clocks, ...customComponentInstances];
        allComponents.forEach(component => {
            // Check if component center is within the box bounds
            const cx = component.x + component.width / 2;
            const cy = component.y + component.height / 2;
            if (cx >= boxX1 && cx <= boxX2 && cy >= boxY1 && cy <= boxY2) {
                itemsInBox.push(component);
            }
            // Alternative: Check for bounding box overlap (more complex)
        });

        if (!event.shiftKey) {
            // Replace selection
            console.log(`[MouseUp] Shift NOT held. Items in box: ${itemsInBox.map(i => i.id).join(', ')}`);
            console.log(`[MouseUp] selectedItems BEFORE replace: ${selectedItems.map(i => i.id).join(', ')}`);
            selectedItems = itemsInBox;
            console.log(`[MouseUp] selectedItems AFTER replace: ${selectedItems.map(i => i.id).join(', ')}`);
        } else {
            // Add to selection (avoid duplicates)
             console.log(`[MouseUp] Shift IS held. Items in box: ${itemsInBox.map(i => i.id).join(', ')}`);
            itemsInBox.forEach(item => {
                if (!selectedItems.some(sel => sel.id === item.id)) {
                    selectedItems.push(item);
                }
            });
            console.log(`[MouseUp] selectedItems AFTER add: ${selectedItems.map(i => i.id).join(', ')}`);
        }
        
        console.log('[MouseUp] Setting justFinishedSelectionBox = true');
        justFinishedSelectionBox = true; // Set flag BEFORE resetting isSelectingBox
        isSelectingBox = false; // Reset box state
        drawCircuit(); // Redraw to show final selection
        return; // Prevent triggering other mouseup actions like stopping drag
    }

    // Stop Dragging
    if (isDragging) {
        console.log(`Dragging stopped.`);
        isDragging = false;
        draggedItem = null; 
        canvas.style.cursor = 'default';
    }
}

function handleMouseLeave(event) {
    if (isDragging) {
        console.log('Dragging stopped (mouse left canvas)');
        isDragging = false;
        draggedItem = null;
    }
    if (isConnecting) {
        console.log('Connection cancelled (mouse left canvas)');
        isConnecting = false;
        startNode = null;
        potentialWire = null;
        drawCircuit();
    }
    if (isPanning) {
        console.log('Panning stopped (mouse left canvas)');
        isPanning = false;
        canvas.style.cursor = 'default';
    }
    
    if (isSelectingBox) {
        console.log('Selection box cancelled (mouse left canvas)');
        isSelectingBox = false;
        drawCircuit(); // Remove the box from view
    }
}

function handleWheel(event) {
    event.preventDefault(); // Prevent page scroll

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // World coordinates under the mouse before zoom
    const worldBefore = screenToWorld(mouseX, mouseY);

    // Calculate new scale factor
    const scaleAmount = -event.deltaY * 0.001; // Adjust sensitivity
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewScale + scaleAmount));
    const scaleChange = newScale / viewScale;

    // Adjust offset to keep the point under the mouse stationary
    viewOffsetX = mouseX - worldBefore.x * newScale;
    viewOffsetY = mouseY - worldBefore.y * newScale;

    // Apply the new scale
    viewScale = newScale;

    // console.log(`Zoom: Scale=${viewScale.toFixed(2)}, Offset=(${viewOffsetX.toFixed(0)}, ${viewOffsetY.toFixed(0)})`);
    drawCircuit();
    updateStatusIndicators(); // Update indicators after wheel zoom
}

// --- View Control Functions ---
function zoom(factor) {
    const centerScreenX = canvas.width / 2;
    const centerScreenY = canvas.height / 2;
    const worldBefore = screenToWorld(centerScreenX, centerScreenY);

    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewScale * factor));

    viewOffsetX = centerScreenX - worldBefore.x * newScale;
    viewOffsetY = centerScreenY - worldBefore.y * newScale;
    viewScale = newScale;

    drawCircuit();
    updateStatusIndicators();
}

function resetView() {
    console.log('Resetting view');
    viewOffsetX = 0;
    viewOffsetY = 0;
    viewScale = 1;
    drawCircuit();
    updateStatusIndicators();
}

// --- Helper: Update Status Indicators ---
function updateStatusIndicators() {
    zoomLevelSpan.textContent = `${viewScale.toFixed(2)}x`;
    offsetXSpan.textContent = viewOffsetX.toFixed(0);
    offsetYSpan.textContent = viewOffsetY.toFixed(0);
}

// --- Core Functions ---
function addGate(type) {
    console.log(`Adding ${type} gate`);
    // Place new components near the center of the current view
    const centerWorld = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const x = centerWorld.x - GATE_WIDTH / 2 + (Math.random() - 0.5) * 30; // Random offset
    const y = centerWorld.y - GATE_HEIGHT / 2 + (Math.random() - 0.5) * 30;

    const newGate = {
        id: `gate_${nextId++}`,
        type: type,
        x: x, // World coordinates
        y: y, // World coordinates
        width: GATE_WIDTH,
        height: GATE_HEIGHT,
    };
    const nodes = getNodePositions(newGate);
    newGate.inputNodes = nodes.inputs;
    newGate.outputNodes = nodes.outputs;
    gates.push(newGate);
    drawCircuit();
}

function addInput() {
     console.log('Adding Input');
     const centerWorld = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
     const x = centerWorld.x - IO_WIDTH / 2 + (Math.random() - 0.5) * 30; 
     const y = centerWorld.y - IO_HEIGHT / 2 + (Math.random() - 0.5) * 30;

    const newInput = {
        id: `input_${nextId++}`,
        type: 'INPUT',
        x: x, // World coordinates
        y: y, // World coordinates
        width: IO_WIDTH,
        height: IO_HEIGHT,
        value: 0
    };
    const nodes = getNodePositions(newInput);
    newInput.inputNodes = nodes.inputs;
    newInput.outputNodes = nodes.outputs;
    inputs.push(newInput);
    drawCircuit();
}

function addOutput() {
    console.log('Adding Output');
    const centerWorld = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const x = centerWorld.x - IO_WIDTH / 2 + (Math.random() - 0.5) * 30; 
    const y = centerWorld.y - IO_HEIGHT / 2 + (Math.random() - 0.5) * 30;

    const newOutput = {
        id: `output_${nextId++}`,
        type: 'OUTPUT',
        x: x, // World coordinates
        y: y, // World coordinates
        width: IO_WIDTH,
        height: IO_HEIGHT,
        value: undefined
    };
    const nodes = getNodePositions(newOutput);
    newOutput.inputNodes = nodes.inputs;
    newOutput.outputNodes = nodes.outputs;
    outputs.push(newOutput);
    drawCircuit();
}

function addClock() {
    console.log('Adding Clock');
    const periodStr = prompt("Enter clock period in milliseconds (e.g., 1000 for 1Hz):", "1000");
    const period = parseInt(periodStr, 10);

    if (isNaN(period) || period <= 0) {
        alert("Invalid period. Please enter a positive number.");
        return;
    }

    const centerWorld = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const x = centerWorld.x - IO_WIDTH / 2 + (Math.random() - 0.5) * 30;
    const y = centerWorld.y - IO_HEIGHT / 2 + (Math.random() - 0.5) * 30;

    const newClock = {
        id: `clock_${nextId++}`,
        type: 'CLOCK',
        x: x, // World coordinates
        y: y, // World coordinates
        width: IO_WIDTH,
        height: IO_HEIGHT,
        value: 0,
        period: period,
        // intervalId will be set below
    };

    const nodes = getNodePositions(newClock);
    newClock.inputNodes = nodes.inputs; // Should be empty
    newClock.outputNodes = nodes.outputs; // Should have one

    // Start the interval timer for this clock
    const intervalId = setInterval(() => {
        // Find the clock object in the array (important in case it was deleted)
        const currentClock = clocks.find(clk => clk.id === newClock.id);
        if (currentClock) {
            currentClock.value = 1 - currentClock.value; // Toggle value
            console.log(`Clock ${currentClock.id} ticked to ${currentClock.value}`);
            simulate(); // Trigger simulation after clock tick
        }
    }, newClock.period);

    // Store the interval ID for cleanup
    clockIntervals.set(newClock.id, intervalId);

    clocks.push(newClock);
    drawCircuit();
}

// --- Helper: Calculate Gate Output ---
function calculateGateOutput(gateType, inputVals) {
    let outputVal = undefined;

    // Be strict: Wait for defined inputs before calculating.
    if (gateType === 'NOT') {
        // NOT gate only needs the first input defined.
        if (inputVals[0] === undefined) {
            // console.log(`Gate ${gateType} waiting for input 0`); // DEBUG
            return undefined;
        }
    } else { // Assumes 2-input gates for AND, OR, XOR, NAND, NOR
        if (inputVals.some(v => v === undefined)) {
             // console.log(`Gate ${gateType} waiting for inputs: ${inputVals}`); // DEBUG
            return undefined; // Wait for all inputs to be defined
        }
    }

    // If we get here, required inputs are defined.
    // Convert inputs to 0 or 1 for calculation.
    const vals = inputVals.map(v => (v === 1 ? 1 : 0)); // Treat undefined or non-1 as 0

    try {
        switch (gateType) {
            case 'AND': outputVal = (vals[0] === 1 && vals[1] === 1) ? 1 : 0; break;
            case 'OR':  outputVal = (vals[0] === 1 || vals[1] === 1) ? 1 : 0; break;
            case 'XOR': outputVal = (vals[0] !== vals[1]) ? 1 : 0; break; // Assumes 2 inputs
            case 'NOT': outputVal = (vals[0] === 0) ? 1 : 0; break;
            case 'NAND':outputVal = (vals[0] === 1 && vals[1] === 1) ? 0 : 1; break;
            case 'NOR': outputVal = (vals[0] === 1 || vals[1] === 1) ? 0 : 1; break;
            default:    console.warn("Unknown gate type in calculation:", gateType); outputVal = undefined;
        }
    } catch (error) {
        console.error(`Error calculating gate type ${gateType}:`, error);
        outputVal = undefined; // Set to undefined on error
    }
    return outputVal;
}

function simulate() {
    console.log('Simulating circuit...');
    let nodeValues = new Map(); // Stores calculated value for each OUTPUT node ID
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100; // Prevent infinite loops
    const MAX_INTERNAL_ITERATIONS = 50; // Prevent infinite loops within custom components

    // --- Initialization ---
    // 1. Clear previous simulation state (optional, could keep output values)
    outputs.forEach(o => o.value = undefined);
    // 2. Set initial values from Input components
    inputs.forEach(input => {
        if (input.outputNodes && input.outputNodes.length > 0) {
            nodeValues.set(input.outputNodes[0].id, input.value);
        }
    });
    // 3. Set initial values from Clock components
    clocks.forEach(clock => {
        if (clock.outputNodes && clock.outputNodes.length > 0) {
            nodeValues.set(clock.outputNodes[0].id, clock.value);
        }
    });
    // 4. Initialize all gate output nodes to 0 (instead of undefined)
    gates.forEach(gate => {
        gate.outputNodes.forEach(node => nodeValues.set(node.id, 0)); 
    });
    // 5. Initialize all custom component *external* output nodes to 0
    customComponentInstances.forEach(instance => {
        instance.outputNodes.forEach(node => nodeValues.set(node.id, 0));
    });

    // --- DEBUG: Log initial values ---
    console.log("  [Simulate] Initial nodeValues:", Object.fromEntries(nodeValues));

    // --- Simulation Loop ---
    changed = true; // Force first iteration, required for feedback loops
    while (changed && iterations < MAX_ITERATIONS) {
        changed = false; // Reset changed flag for this iteration
        iterations++;

        // --- Process Basic Gates ---
        gates.forEach(gate => {
            // Get input values for this gate
            let inputVals = gate.inputNodes.map(inputNode => {
                const connection = connections.find(c => c.endNode.id === inputNode.id); 
                if (connection) {
                    const sourceNodeId = connection.startNode.id;
                    const value = nodeValues.get(sourceNodeId);
                    return value;
                } else {
                    return 0; // Treat unconnected inputs as 0 for basic gates
                }
            });

            // Calculate output using the helper function
            let outputVal = calculateGateOutput(gate.type, inputVals);

            // Update node value if changed
            const outputNode = gate.outputNodes[0];
            if (nodeValues.get(outputNode.id) !== outputVal && outputVal !== undefined) {
                nodeValues.set(outputNode.id, outputVal);
                console.log(`  [Simulate Iteration ${iterations}] Basic Gate Node ${outputNode.id} (${gate.type}) updated to: ${outputVal} (Inputs: ${inputVals})`);
                changed = true;
            }
        });

        // --- Process Custom Component Instances ---
        customComponentInstances.forEach(instance => {
            if (!instance.internalStructure) {
                console.warn(`Instance ${instance.id} is missing internalStructure. Skipping.`);
                return; // Skip if structure wasn't properly created
            }

            let internalNodeValues = new Map();
            let internalChanged = true;
            let internalIterations = 0;

            // Initialize internal node values (important!)
            // Initialize internal gate outputs to 0
            instance.internalStructure.gates.forEach(internalGate => {
                internalGate.outputNodes.forEach(node => internalNodeValues.set(node.id, 0));
            });

            // Propagate external input values to internal nodes
            instance.inputNodes.forEach(externalInputNode => {
                const connection = connections.find(c => c.endNode.id === externalInputNode.id);
                let externalValue = undefined;
                if (connection) {
                    externalValue = nodeValues.get(connection.startNode.id);
                }
                // Find the corresponding internal node ID using the map
                const internalTargetNodeId = instance.internalStructure.externalInputMap.get(externalInputNode.id);
                if (internalTargetNodeId) {
                    // Set initial value for the internal node connected to the external input
                     internalNodeValues.set(internalTargetNodeId, externalValue === undefined ? 0 : externalValue); // Default unconnected/undefined external inputs to 0 internally
                     console.log(`  [Simulate Custom ${instance.id}] Propagating external input ${externalInputNode.id} (${externalValue}) to internal ${internalTargetNodeId}`);
                }
            });

            // --- Internal Simulation Loop for this Instance ---
            while (internalChanged && internalIterations < MAX_INTERNAL_ITERATIONS) {
                internalChanged = false;
                internalIterations++;

                instance.internalStructure.gates.forEach(internalGate => {
                    let internalInputVals = internalGate.inputNodes.map(internalInputNode => {
                        // Find connection within the *instance\'s* internal structure
                        const internalConnection = instance.internalStructure.connections.find(ic => ic.endNode.id === internalInputNode.id);
                        if (internalConnection) {
                             return internalNodeValues.get(internalConnection.startNode.id);
                        } else {
                             // Check if this internal input node is directly mapped from an external input
                             // We need to check if this internalInputNode.id is a *value* in the externalInputMap
                             const isMappedFromExternal = [...instance.internalStructure.externalInputMap.values()].includes(internalInputNode.id);

                             if (isMappedFromExternal) {
                                 // Get the value set during input propagation
                                  return internalNodeValues.get(internalInputNode.id);
                             } else {
                                 // Unconnected internal node (should ideally not happen if definition is sound)
                                  console.warn(`  [Simulate Custom ${instance.id}] Internal node ${internalInputNode.id} appears unconnected.`);
                                 return 0; // Default to 0 if truly unconnected internally
                             }
                        }
                    });

                    let internalOutputVal = calculateGateOutput(internalGate.type, internalInputVals);

                    const internalOutputNode = internalGate.outputNodes[0];
                    if (internalNodeValues.get(internalOutputNode.id) !== internalOutputVal && internalOutputVal !== undefined) {
                        internalNodeValues.set(internalOutputNode.id, internalOutputVal);
                        console.log(`    [Simulate Custom ${instance.id} Iteration ${internalIterations}] Internal Node ${internalOutputNode.id} (${internalGate.type}) updated to: ${internalOutputVal} (Inputs: ${internalInputVals})`);
                        internalChanged = true;
                    }
                });
            }

            if (internalIterations >= MAX_INTERNAL_ITERATIONS) {
                 console.warn(`  [Simulate Custom ${instance.id}] Reached max internal iterations.`);
            }

            // Propagate internal output values to external nodes (update main nodeValues)
            instance.outputNodes.forEach(externalOutputNode => {
                // Find the internal *source* node mapped to this external output node
                let internalSourceNodeId = null;
                // The internalOutputMap maps: Cloned Internal Source Node ID -> External Instance Output Node ID
                for (const [sourceId, externalIdMapped] of instance.internalStructure.internalOutputMap.entries()) {
                     if (externalIdMapped === externalOutputNode.id) {
                         internalSourceNodeId = sourceId; // This IS the ID of the internal node providing the value
                        break;
                }
                 }

                if (internalSourceNodeId) {
                    // Get the value directly from the internal node that sources this output
                    const finalInternalValue = internalNodeValues.get(internalSourceNodeId);

                    if (nodeValues.get(externalOutputNode.id) !== finalInternalValue && finalInternalValue !== undefined) {
                         nodeValues.set(externalOutputNode.id, finalInternalValue);
                         console.log(`  [Simulate Iteration ${iterations}] Custom ${instance.id} propagating internal output from source ${internalSourceNodeId} (${finalInternalValue}) to external ${externalOutputNode.id}`);
                         changed = true; // Mark change in the *main* simulation
                    }
                 } else {
                    // This warning is expected if the original OUTPUT block wasn't connected internally
                     console.warn(`  [Simulate Custom ${instance.id}] Could not find internal source mapping for external output ${externalOutputNode.id}`);
                 }
            });
        });
    }

    if (iterations >= MAX_ITERATIONS) {
        console.warn('Simulation reached max iterations. Possible unstable circuit or feedback loop.');
    }

    // --- Update Output Components ---
    outputs.forEach(output => {
        const inputNode = output.inputNodes[0];
         // Find connection based on the END node's ID matching the output component's input node ID
        const connection = connections.find(c => c.endNode.id === inputNode.id);
        let finalValue = 0; // Default to 0
        if (connection) {
            const sourceNodeValue = nodeValues.get(connection.startNode.id);
             // DEBUG: Log value fetched for output
            // console.log(`  [Simulate] Output ${output.id} connected to ${connection.startNode.id}, value=${sourceNodeValue}`);
            finalValue = (sourceNodeValue === undefined) ? 0 : sourceNodeValue; // <-- Problem? Maybe should be undefined if source is undefined?
        } else {
             // DEBUG: Log unconnected output
             // console.log(`  [Simulate] Output ${output.id} is unconnected.`);
             finalValue = 0; // Unconnected output shows 0
        }
        // Keep output undefined if the source node is undefined after simulation
        output.value = finalValue;
         // DEBUG: Log final output component value
        // console.log(`  [Simulate] Setting Output ${output.id} value to: ${output.value}`);

    });

    // console.log('Simulation complete.'); // DEBUG
    drawCircuit(); // Redraw to show updated output values
}

function resetCircuit() {
    console.log('Resetting circuit');
    // Clear existing intervals
    clockIntervals.forEach(intervalId => clearInterval(intervalId));
    clockIntervals.clear();

    gates = [];
    inputs = [];
    outputs = [];
    clocks = [];
    connections = [];
    customComponentDefinitions = []; // Clear definitions
    customComponentInstances = []; // Clear instances
    localStorage.removeItem('customComponents'); // Clear from localStorage
    console.log("Cleared custom component definitions from localStorage.");
    nextId = 0;
    selectedItems = []; // Clear selection array
    resetView(); // Reset view as part of full reset
    updateCustomComponentListUI(); // Update sidebar to remove custom buttons
    // No need to call drawCircuit/updateStatus here, resetView does it
}

function deleteSelected() {
    if (selectedItems.length === 0) { // Check if array is empty
        console.log('Nothing selected to delete.');
        return;
    }

    console.log(`Deleting ${selectedItems.length} items.`);
    const itemsToDeleteIds = selectedItems.map(item => item.id);

    // Clear intervals for any selected clocks before removing them
    selectedItems.forEach(item => {
        if (item.type === 'CLOCK') {
            const intervalId = clockIntervals.get(item.id);
            if (intervalId) {
                clearInterval(intervalId);
                clockIntervals.delete(item.id);
                console.log(`Cleared interval for deleted clock ${item.id}`);
            }
        }
    });

    // 1. Remove connections attached to ANY selected item
    let nodesToDeleteIds = new Set();
    selectedItems.forEach(item => {
        [...(item.inputNodes || []), ...(item.outputNodes || [])].forEach(node => nodesToDeleteIds.add(node.id));
    });

    connections = connections.filter(conn => {
        const startNodeMatches = nodesToDeleteIds.has(conn.startNode.id);
        const endNodeMatches = nodesToDeleteIds.has(conn.endNode.id);
        if (startNodeMatches || endNodeMatches) {
            console.log(`Removing connection associated with deleted node: ${conn.id}`);
            return false; 
        }
        return true; 
    });

    // 2. Remove the items themselves
    inputs = inputs.filter(item => !itemsToDeleteIds.includes(item.id));
    outputs = outputs.filter(item => !itemsToDeleteIds.includes(item.id));
    gates = gates.filter(item => !itemsToDeleteIds.includes(item.id));
    clocks = clocks.filter(item => !itemsToDeleteIds.includes(item.id)); // Remove selected clocks
    customComponentInstances = customComponentInstances.filter(item => !itemsToDeleteIds.includes(item.id)); // Remove selected custom instances

    // 3. Deselect and redraw
    selectedItems = []; // Clear selection array
    drawCircuit();
    simulate(); 
}

function drawCircuit() {
    // Clear canvas (using screen coordinates, ignore transforms)
    ctx.save(); // Save default context state
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to draw background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore(); // Restore context state (might have transforms)

    // Apply viewport transformations
    ctx.save();
    ctx.translate(viewOffsetX, viewOffsetY);
    ctx.scale(viewScale, viewScale);

    // --- Draw elements in WORLD coordinates --- 
    // Common styles (line width might need adjusting based on scale?)
    const baseLineWidth = 1;
    const scaledLineWidth = baseLineWidth / viewScale; // Keep line width visually consistent
    ctx.lineWidth = scaledLineWidth;
    ctx.strokeStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Adjust font size based on scale?
    const baseFontSize = 14;
    ctx.font = `${baseFontSize / viewScale}px sans-serif`;

    // Function to draw nodes for a component (needs world coords)
    function drawNodes(component) {
        ctx.fillStyle = '#666'; // Node color
        const scaledNodeRadius = NODE_RADIUS / viewScale; // Scale node radius too
        (component.inputNodes || []).forEach(node => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, scaledNodeRadius, 0, 2 * Math.PI); // Use world coords
            ctx.fill();
        });
        (component.outputNodes || []).forEach(node => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, scaledNodeRadius, 0, 2 * Math.PI); // Use world coords
            ctx.fill();
        });
    }

    // Draw components
    // Combine all drawable items: gates, inputs, outputs, clocks, custom instances
    [...gates, ...inputs, ...outputs, ...clocks, ...customComponentInstances].forEach(component => {
        // Check if the current component is in the selectedItems array
        const isSelected = selectedItems.some(item => item.id === component.id);
        ctx.lineWidth = (isSelected ? 3 : 1) * scaledLineWidth; 
        ctx.strokeStyle = isSelected ? '#007bff' : '#333';

        // Draw gate body (using world x/y)
        if (component.type === 'AND' || component.type === 'OR' || component.type === 'NOT' || component.type === 'XOR' || component.type === 'NAND' || component.type === 'NOR') {
             ctx.fillStyle = '#eee';
             ctx.beginPath();
             ctx.roundRect(component.x, component.y, component.width, component.height, [5 / viewScale]); // Scale corner radius
             ctx.fill();
             ctx.stroke();
             ctx.fillStyle = '#333';
             ctx.fillText(component.type, component.x + component.width / 2, component.y + component.height / 2);
        }
        // Draw input body (using world x/y)
        else if (component.type === 'INPUT') {
            ctx.fillStyle = component.value === 1 ? '#90EE90' : '#F08080'; // Color based on state
            ctx.beginPath();
            ctx.rect(component.x, component.y, component.width, component.height);
            ctx.fill();
            ctx.stroke();

            // Draw Label ("INPUT") above
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom'; // Align bottom of text to y pos
            ctx.fillText('INPUT', component.x + component.width / 2, component.y - 5 / viewScale); // Offset above

            // Draw State (0 or 1) inside
            ctx.textBaseline = 'middle'; // Reset baseline for centered text
            ctx.fillText(component.value, component.x + component.width / 2, component.y + component.height / 2);
        }
        // Draw clock body
        else if (component.type === 'CLOCK') {
            ctx.fillStyle = component.value === 1 ? '#90EE90' : '#F08080'; // Color based on state
            ctx.beginPath();
            ctx.rect(component.x, component.y, component.width, component.height);
            ctx.fill();
            ctx.stroke();

            // Draw Label ("CLOCK") above
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom'; 
            ctx.fillText('CLOCK', component.x + component.width / 2, component.y - 5 / viewScale);

            // Draw State (0 or 1) inside
            ctx.textBaseline = 'middle'; 
            ctx.fillText(component.value, component.x + component.width / 2, component.y + component.height / 2);

            // Optional: Draw a small clock/wave symbol?
            // Could add more detailed drawing here
        }
        // Draw output body (using world x/y)
        else if (component.type === 'OUTPUT') {
            ctx.fillStyle = component.value === 1 ? '#90EE90' : (component.value === 0 ? '#F08080' : '#ddd'); // Color based on state
            ctx.beginPath();
            // Circle centered at (cx, cy) with radius r = component.width / 2
            const cx = component.x + component.width / 2;
            const cy = component.y + component.height / 2; // Assuming height is same as width for circle
            const radius = component.width / 2;
            ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            // Draw Label ("OUTPUT") above
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom'; // Align bottom of text to y pos
            // Position above the circle's top edge (cy - radius)
            ctx.fillText('OUTPUT', cx, component.y - 5 / viewScale); // Offset above (using component.y which is top edge)

            // Draw State (0, 1, or '-') inside
            ctx.textBaseline = 'middle'; // Reset baseline
            const outputStateText = component.value === undefined ? '-' : component.value.toString();
            ctx.fillText(outputStateText, cx, cy);
        }
        // Draw Custom Component Instance
        else if (customComponentDefinitions.some(def => def.name === component.type)) {
             // It's a custom component instance
             ctx.fillStyle = '#d9edf7'; // Light blue background
             ctx.beginPath();
             ctx.roundRect(component.x, component.y, component.width, component.height, [5 / viewScale]);
             ctx.fill();
             ctx.stroke();
             ctx.fillStyle = '#31708f'; // Darker blue text
             ctx.fillText(component.type, component.x + component.width / 2, component.y + component.height / 2);
        }
        // Fallback for unknown types (should not happen)
        else {
            console.warn("Unknown component type in drawCircuit:", component.type, component.id);
            ctx.fillStyle = 'red';
            ctx.fillRect(component.x, component.y, component.width, component.height);
            ctx.fillStyle = 'white';
            ctx.fillText('?', component.x + component.width / 2, component.y + component.height / 2);
        }

        drawNodes(component);
    });

    // Draw Connections (Wires - use stored world coords)
    ctx.strokeStyle = '#007bff'; 
    ctx.lineWidth = 2 * scaledLineWidth; // Scale wire thickness
    connections.forEach(conn => {
        ctx.beginPath();
        ctx.moveTo(conn.startX, conn.startY);
        ctx.lineTo(conn.endX, conn.endY);
        ctx.stroke();
    });

    // Draw potential wire if connecting (use world coords)
    if (isConnecting && potentialWire) {
        ctx.strokeStyle = '#aaa'; 
        ctx.lineWidth = 1 * scaledLineWidth;
        ctx.beginPath();
        ctx.moveTo(potentialWire.x1, potentialWire.y1);
        ctx.lineTo(potentialWire.x2, potentialWire.y2);
        ctx.stroke();
    }

    // Draw Selection Box (in world coordinates)
    if (isSelectingBox) {
        ctx.fillStyle = 'rgba(0, 123, 255, 0.1)'; // Light blue, semi-transparent fill
        ctx.strokeStyle = 'rgba(0, 123, 255, 0.5)'; // Blue border
        ctx.lineWidth = 1 / viewScale; // Thin line, adjusted for scale
        ctx.beginPath();
        ctx.rect(
            selectionBoxStartX,
            selectionBoxStartY,
            selectionBoxEndX - selectionBoxStartX,
            selectionBoxEndY - selectionBoxStartY
        );
        ctx.fill();
        ctx.stroke();
    }

    // Restore context to remove transformations for next frame
    ctx.restore(); 
}

// --- Initial Setup ---
// Function to handle canvas resizing
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    // Check if the canvas buffer size needs to be updated
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        console.log(`Canvas resized (DPR ${dpr}): ${canvas.width}x${canvas.height}`);
        
        // We don't need ctx.scale(dpr, dpr) here.
        // The browser handles scaling the larger buffer down to the CSS display size.
        // Our drawing logic operates in the buffer's coordinate space.
    }
    // Redraw is always needed after resize potentially changes layout
    drawCircuit(); 
}

// Set initial size and add resize listener
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial sizing

updateStatusIndicators(); // Initialize indicators on load

// --- Helper Functions ---
function getNodePositions(component) {
    // Node positions should be calculated relative to component's world x/y
    const nodes = { inputs: [], outputs: [] };
    const cx = component.x + component.width / 2;
    const cy = component.y + component.height / 2;

    switch (component.type) {
        case 'INPUT':
        case 'CLOCK': // Clocks only have an output node
            nodes.outputs.push({ id: `${component.id}_out0`, x: component.x + component.width, y: cy, parent: component });
            break;
        case 'OUTPUT':
            nodes.inputs.push({ id: `${component.id}_in0`, x: component.x, y: cy, parent: component });
            break;
        case 'NOT':
            nodes.inputs.push({ id: `${component.id}_in0`, x: component.x, y: cy, parent: component });
            nodes.outputs.push({ id: `${component.id}_out0`, x: component.x + component.width, y: cy, parent: component });
            break;
        case 'AND':
        case 'OR':
        case 'XOR':
        case 'NAND':
        case 'NOR':
            nodes.inputs.push({ id: `${component.id}_in0`, x: component.x, y: component.y + component.height * 0.25, parent: component });
            nodes.inputs.push({ id: `${component.id}_in1`, x: component.x, y: component.y + component.height * 0.75, parent: component });
            nodes.outputs.push({ id: `${component.id}_out0`, x: component.x + component.width, y: cy, parent: component });
            break;
        default:
            // Handle custom components - nodes are pre-calculated on the instance object
            if (customComponentDefinitions.some(def => def.name === component.type)) {
                // Node positions are already absolute world coordinates stored on the instance
                nodes.inputs = component.inputNodes || [];
                nodes.outputs = component.outputNodes || [];
            } else {
                 console.warn("Unknown component type in getNodePositions:", component.type);
            }
            break;
    }
    return nodes;
}

// --- Keyboard Handler ---
function handleKeyDown(event) {
    // console.log('Key pressed:', event.key, 'Ctrl:', event.ctrlKey);

    // Ignore key presses if an input field is focused (future-proofing)
    // const activeElement = document.activeElement;
    // if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
    //     return;
    // }

    // --- DELETE Key --- 
    if (event.key === 'Delete') {
        console.log('DELETE key pressed');
        deleteSelected();
        // Optional: prevent default browser back navigation if Delete is used for that
        // event.preventDefault(); 
    }

    // --- CTRL + C (Copy) ---
    if (event.ctrlKey && event.key === 'c') {
        console.log('CTRL+C pressed');
        event.preventDefault(); // Prevent default browser copy
        copySelected();
    }

    // --- CTRL + V (Paste) ---
    if (event.ctrlKey && event.key === 'v') {
        console.log('CTRL+V pressed');
        event.preventDefault(); // Prevent default browser paste
        pasteClipboard();
    }
}

// --- Copy/Paste Functions ---
function copySelected() {
    if (selectedItems.length === 0) {
        console.log('Nothing selected to copy.');
        clipboard = []; // Clear clipboard if nothing selected
        return;
    }

    clipboard = selectedItems.map(item => {
        const copyData = { type: item.type };
        if (item.type === 'INPUT') {
            copyData.value = item.value; // Copy input value
        }
        // Store original position to maybe calculate relative later?
        // copyData.x = item.x;
        // copyData.y = item.y;
        return copyData;
    });

    console.log(`Copied ${clipboard.length} items to clipboard.`, clipboard);
}

function pasteClipboard() {
    if (clipboard.length === 0) {
        console.log('Clipboard is empty.');
        return;
    }

    console.log(`Pasting ${clipboard.length} items...`);
    const pasteCenter = screenToWorld(canvas.width / 2, canvas.height / 2);
    const newSelection = [];
    let pasteOffsetX = 0;
    let pasteOffsetY = 0;
    const PASTE_OFFSET_STEP = 10; // Offset each pasted item slightly

    clipboard.forEach((itemData, index) => {
        // Calculate position near center view, slightly offset for each item
        const x = pasteCenter.x - (itemData.type === 'INPUT' || itemData.type === 'OUTPUT' ? IO_WIDTH : GATE_WIDTH) / 2 + pasteOffsetX;
        const y = pasteCenter.y - (itemData.type === 'INPUT' || itemData.type === 'OUTPUT' ? IO_HEIGHT : GATE_HEIGHT) / 2 + pasteOffsetY;

        let newItem = null;

        if (itemData.type === 'INPUT') {
            newItem = {
                id: `input_${nextId++}`, type: 'INPUT', x, y,
                width: IO_WIDTH, height: IO_HEIGHT, value: itemData.value || 0
            };
            const nodes = getNodePositions(newItem);
            newItem.inputNodes = nodes.inputs;
            newItem.outputNodes = nodes.outputs;
            inputs.push(newItem);
        } else if (itemData.type === 'OUTPUT') {
             newItem = {
                id: `output_${nextId++}`, type: 'OUTPUT', x, y,
                width: IO_WIDTH, height: IO_HEIGHT, value: undefined
            };
            const nodes = getNodePositions(newItem);
            newItem.inputNodes = nodes.inputs;
            newItem.outputNodes = nodes.outputs;
            outputs.push(newItem);
        } else { // It's a gate
             newItem = {
                id: `gate_${nextId++}`, type: itemData.type, x, y,
                width: GATE_WIDTH, height: GATE_HEIGHT
            };
            const nodes = getNodePositions(newItem);
            newItem.inputNodes = nodes.inputs;
            newItem.outputNodes = nodes.outputs;
            gates.push(newItem);
        }
        
        if (newItem) {
            newSelection.push(newItem);
            pasteOffsetX += PASTE_OFFSET_STEP;
            pasteOffsetY += PASTE_OFFSET_STEP;
        }
    });

    // Select the newly pasted items
    selectedItems = newSelection;

    drawCircuit();
    simulate(); // Simulate after pasting
}

function updateCustomComponentListUI() {
    const listDiv = document.getElementById('custom-components-list');
    // Clear existing buttons except the h3
    listDiv.querySelectorAll('.custom-component-entry').forEach(entry => entry.remove());

    customComponentDefinitions.forEach(def => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'custom-component-entry'; // Class for the container div

        const button = document.createElement('button');
        button.textContent = def.name;
        button.addEventListener('click', () => addCustomComponentInstance(def.name));

        const removeButton = document.createElement('button');
        removeButton.textContent = 'X'; // Or use an icon/image
        removeButton.className = 'remove-custom-btn'; // Class for styling
        removeButton.title = `Remove ${def.name}`;
        removeButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent triggering the add instance button
            removeCustomComponent(def.name);
        });

        entryDiv.appendChild(button);
        entryDiv.appendChild(removeButton);
        listDiv.appendChild(entryDiv);
    });
}

function removeCustomComponent(name) {
    if (!confirm(`Are you sure you want to remove the custom component "${name}"? This will also remove all instances of it from the circuit.`)) {
        return;
    }

    const definitionIndex = customComponentDefinitions.findIndex(def => def.name === name);
    if (definitionIndex === -1) {
        console.error("Could not find custom component definition:", name);
        return;
    }

    // 1. Remove the definition
    customComponentDefinitions.splice(definitionIndex, 1);

    // 2. Remove instances from the canvas
    const instancesToRemove = customComponentInstances.filter(inst => inst.customType === name);
    const instanceIdsToRemove = new Set(instancesToRemove.map(inst => inst.id));
    customComponentInstances = customComponentInstances.filter(inst => inst.customType !== name);

    // 3. Remove connections associated with removed instances
    connections = connections.filter(conn =>
        !instanceIdsToRemove.has(conn.from.parent.id) &&
        !instanceIdsToRemove.has(conn.to.parent.id)
    );

    // --- DEBUGGING --- 
    console.log('[Before UI Update] customComponentDefinitions:', JSON.stringify(customComponentDefinitions));

    // 4. Update the UI list
    updateCustomComponentListUI();

     // --- DEBUGGING --- 
    console.log('[After UI Update] customComponentDefinitions:', JSON.stringify(customComponentDefinitions));

    // 5. Update Local Storage
    localStorage.setItem('customComponentDefinitions', JSON.stringify(customComponentDefinitions));

    // 6. Remove from selection if any were selected
    selectedItems = selectedItems.filter(item => !instanceIdsToRemove.has(item.id));

    // 7. Redraw
    drawCircuit();
    simulate(); // Resimulate after removal

    console.log(`Removed custom component "${name}" and its instances.`);
}

function saveSelectionAsComponent() {
    if (selectedItems.length === 0) {
        alert("Please select components to include in the custom component.");
        return;
    }

    const name = prompt("Enter a name for the new custom component:");
    if (!name || name.trim() === "") {
        alert("Component name cannot be empty.");
        return;
    }
    if (customComponentDefinitions.some(def => def.name === name)) {
        alert(`A custom component with the name "${name}" already exists.`);
        return;
    }

    console.log(`Attempting to save selection as component: ${name}`);

    // Deep clone selected items manually to avoid cyclic reference issues with node.parent
    const clonedSelection = selectedItems.map(item => {
        const clone = { ...item }; // Shallow clone the item
        // Deep clone nodes but omit the parent property
        if (clone.inputNodes) {
            clone.inputNodes = item.inputNodes.map(node => {
                const { parent, ...nodeClone } = node; // Destructure to omit parent
                return nodeClone;
            });
        }
        if (clone.outputNodes) {
            clone.outputNodes = item.outputNodes.map(node => {
                const { parent, ...nodeClone } = node; // Destructure to omit parent
                return nodeClone;
            });
        }
        // Note: This doesn't handle nested custom components deeply yet.
        return clone;
    });

    let internalGates = [];
    let externalInputs = [];
    let externalOutputs = [];
    let componentIdMap = new Map(); // Map original IDs to cloned item objects

    clonedSelection.forEach(item => {
        componentIdMap.set(item.id, item); // Store mapping for connection cloning later
        if (item.type === 'INPUT') {
            externalInputs.push(item);
        } else if (item.type === 'OUTPUT') {
            externalOutputs.push(item);
        } else {
            // Treat gates (and potentially other custom components?) as internal
            internalGates.push(item);
        }
    });

    if (externalInputs.length === 0 && externalOutputs.length === 0) {
        alert("The selection must contain at least one INPUT or OUTPUT block to define the component's interface.");
        return;
    }

    // --- Calculate Bounding Box for internal gates + IO (relative coords) ---
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    clonedSelection.forEach(item => { // Use the whole cloned selection for bounds
        minX = Math.min(minX, item.x);
        minY = Math.min(minY, item.y);
        maxX = Math.max(maxX, item.x + item.width);
        maxY = Math.max(maxY, item.y + item.height);
    });
    const boundingBox = {
        x: minX,
        y: minY
        // Width/Height are now fixed for the definition
    };


    // Find connections that are *internal* to the selection (connecting two items WITHIN the selection,
    // excluding connections TO the interface OUTPUT blocks or FROM the interface INPUT blocks)
    let internalConnections = [];
    const selectedItemIds = new Set(selectedItems.map(item => item.id)); // Use ORIGINAL selected items
    const interfaceInputIds = new Set(externalInputs.map(item => item.id)); // IDs of INPUT blocks identified as interface
    const interfaceOutputIds = new Set(externalOutputs.map(item => item.id)); // IDs of OUTPUT blocks identified as interface

    connections.forEach(conn => { // Iterate through the main connections array
        const startParentId = conn.startNode.parent?.id;
        const endParentId = conn.endNode.parent?.id;

        // Check if BOTH start and end parents are part of the original selection
        if (startParentId && selectedItemIds.has(startParentId) &&
            endParentId && selectedItemIds.has(endParentId)) {

            // Check if it's NOT a connection originating FROM an interface INPUT block
            // AND it's NOT a connection terminating TO an interface OUTPUT block.
            if (!interfaceInputIds.has(startParentId) && !interfaceOutputIds.has(endParentId)) {
                 // This connection is purely internal to the non-interface parts of the selection
                 internalConnections.push({
                    startNodeId: conn.startNode.id, // Store original node ID from the main connection
                    endNodeId: conn.endNode.id,     // Store original node ID from the main connection
                 });
            }
        }
    });

    // --- Define External Interface Nodes based on connections --- 
    let definitionExternalInputs = [];
    externalInputs.forEach((inputComp, index) => {
        const outputNodeId = inputComp.outputNodes[0].id;
        const connectionFromInput = connections.find(c => c.startNode.id === outputNodeId);
        let targetInternalNodeId = null;
        if (connectionFromInput) {
            // Ensure the target is actually within the selection (and not the interface OUTPUT block)
            if (selectedItemIds.has(connectionFromInput.endNode.parent?.id) && !interfaceOutputIds.has(connectionFromInput.endNode.parent?.id)) {
                 targetInternalNodeId = connectionFromInput.endNode.id; // The ID of the internal node receiving input
            }
        }
        if (!targetInternalNodeId) {
             console.warn(`Custom component definition: Interface input ${inputComp.id} does not connect to a valid internal node.`);
        }
        definitionExternalInputs.push({
            id: `${name}_ext_in${index}`, // Definition's external node ID
            targetInternalNodeId: targetInternalNodeId, // ID of the internal node receiving the value
            relativeX: 0,
            relativeY: GATE_HEIGHT * (index + 1) / (externalInputs.length + 1)
        });
    });

    let definitionExternalOutputs = [];
     externalOutputs.forEach((outputComp, index) => {
         const inputNodeId = outputComp.inputNodes[0].id;
         const connectionToOutput = connections.find(c => c.endNode.id === inputNodeId);
         let sourceInternalNodeId = null;
         if (connectionToOutput) {
            // Ensure the source is actually within the selection (and not the interface INPUT block)
            if (selectedItemIds.has(connectionToOutput.startNode.parent?.id) && !interfaceInputIds.has(connectionToOutput.startNode.parent?.id)) {
                 sourceInternalNodeId = connectionToOutput.startNode.id; // The ID of the internal node providing the value
            }
         }
        if (!sourceInternalNodeId) {
             console.warn(`Custom component definition: Interface output ${outputComp.id} is not driven by a valid internal node.`);
         }
         definitionExternalOutputs.push({
             id: `${name}_ext_out${index}`, // Definition's external node ID
             sourceInternalNodeId: sourceInternalNodeId, // ID of the internal node providing the value
             relativeX: GATE_WIDTH,
             relativeY: GATE_HEIGHT * (index + 1) / (externalOutputs.length + 1)
         });
    });

    // --- Create Component Definition ---
    const definition = {
        name: name,
        // Store *clones* of internal gates with coordinates relative to the bounding box origin
        internalGates: internalGates.map(gate => ({ // Only includes non-INPUT/OUTPUT selected items
            ...gate, // Spread operator for the gate properties
            originalId: gate.id, // Store original ID for reference if needed
            x: gate.x - boundingBox.x, // Make relative
            y: gate.y - boundingBox.y, // Make relative
            // Store node definitions relative to the bounding box
            inputNodes: gate.inputNodes.map(n => ({ id: n.id, x: n.x - boundingBox.x, y: n.y - boundingBox.y })),
            outputNodes: gate.outputNodes.map(n => ({ id: n.id, x: n.x - boundingBox.x, y: n.y - boundingBox.y }))
        })),
        internalConnections: internalConnections, // Only includes connections between internalGates
        // Store info about which internal nodes map to external interface nodes
        externalInputNodes: definitionExternalInputs, // Use the structures defined above
         externalOutputNodes: definitionExternalOutputs, // Use the structures defined above
         // Use fixed dimensions for the definition
         width: GATE_WIDTH,
         height: GATE_HEIGHT
    };

    customComponentDefinitions.push(definition);
    console.log("Custom component definition created:", definition);

    // Save updated definitions to localStorage
    try {
        localStorage.setItem('customComponents', JSON.stringify(customComponentDefinitions));
        console.log("Custom component definitions saved to localStorage.");
    } catch (error) {
        console.error("Error saving custom component definitions to localStorage:", error);
        // Optionally alert the user or handle the error
    }

    updateCustomComponentListUI(); // Refresh the sidebar

    // Optional: Deselect items after saving
    selectedItems = [];
    drawCircuit();
}

function addCustomComponentInstance(name) {
    console.log(`Adding instance of ${name}`);
    // alert(`Adding custom component "${name}" (visual only, simulation not implemented yet).`); // Maybe too annoying

    const definition = customComponentDefinitions.find(def => def.name === name);
    if (!definition) {
        console.error(`Definition not found for custom component: ${name}`);
        return;
    }

     // --- Create the Instance Object ---
     const instanceId = `custom_${definition.name}_${nextId++}`;
     const centerWorld = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
     const instanceX = centerWorld.x - definition.width / 2 + (Math.random() - 0.5) * 30; // Add some randomness
     const instanceY = centerWorld.y - definition.height / 2 + (Math.random() - 0.5) * 30;

     // --- Clone Internal Structure ---
     let internalStructure = {
         gates: [],
         connections: [],
         nodeMap: new Map(), // Maps original node ID (within definition) to cloned node object (within instance)
         externalInputMap: new Map(), // Maps external instance input node ID to internal definition node ID
         internalOutputMap: new Map()  // Maps internal definition node ID to external instance output node ID
     };

     // Clone internal gates and create node map
     (definition.internalGates || []).forEach(gateDef => {
         const clonedGate = {
             ...gateDef, // Copy properties like type, relative x/y, width, height
             id: `${instanceId}_internal_${gateDef.originalId || gateDef.id}`, // Unique ID for this instance's internal gate
             x: instanceX + gateDef.x, // Calculate absolute world position (useful for potential future drawing/debugging)
             y: instanceY + gateDef.y,
             inputNodes: [],
             outputNodes: []
         };

         // Clone input nodes and add to map
         (gateDef.inputNodes || []).forEach(nodeDef => {
             const clonedNode = {
                 ...nodeDef, // Copy properties like relative x/y if stored
                 id: `${clonedGate.id}_in${internalStructure.nodeMap.size}`, // Unique ID for instance's internal node
                 x: instanceX + nodeDef.x, // Absolute world position
                 y: instanceY + nodeDef.y,
                 parent: clonedGate // Link node to its cloned gate
             };
             clonedGate.inputNodes.push(clonedNode);
             internalStructure.nodeMap.set(nodeDef.id, clonedNode); // Map original ID to cloned node
         });

         // Clone output nodes and add to map
         (gateDef.outputNodes || []).forEach(nodeDef => {
             const clonedNode = {
                 ...nodeDef,
                 id: `${clonedGate.id}_out${internalStructure.nodeMap.size}`, // Unique ID
                 x: instanceX + nodeDef.x, // Absolute world position
                 y: instanceY + nodeDef.y,
                 parent: clonedGate
             };
             clonedGate.outputNodes.push(clonedNode);
             internalStructure.nodeMap.set(nodeDef.id, clonedNode); // Map original ID to cloned node
         });

         internalStructure.gates.push(clonedGate);
     });

     // Clone internal connections using the node map
     (definition.internalConnections || []).forEach(connDef => {
         const clonedStartNode = internalStructure.nodeMap.get(connDef.startNodeId);
         const clonedEndNode = internalStructure.nodeMap.get(connDef.endNodeId);
         if (clonedStartNode && clonedEndNode) {
             internalStructure.connections.push({
                 id: `conn_${clonedStartNode.id}_${clonedEndNode.id}`,
                 startNode: clonedStartNode, // Reference the cloned node object
                 endNode: clonedEndNode,     // Reference the cloned node object
                 // World coordinates can be added if needed for drawing internal connections
                 startX: clonedStartNode.x,
                 startY: clonedStartNode.y,
                 endX: clonedEndNode.x,
                 endY: clonedEndNode.y
             });
         } else {
             console.warn(`Could not clone internal connection for instance ${instanceId}. Missing nodes for original IDs: ${connDef.startNodeId}, ${connDef.endNodeId}`);
         }
     });


     // Create the external nodes for *this specific instance*
     let instanceInputNodes = definition.externalInputNodes.map((nodeDef, i) => {
         const externalNodeId = `${instanceId}_in${i}`;
         const internalTargetNode = internalStructure.nodeMap.get(nodeDef.targetInternalNodeId);
         if (internalTargetNode) {
             internalStructure.externalInputMap.set(externalNodeId, internalTargetNode.id); // Map external input to internal target
         } else {
             console.warn(`Instance ${instanceId}: Could not find internal target node for external input ${nodeDef.targetInternalNodeId}`);
         }
         return {
             id: externalNodeId, // Unique ID for this instance's node
         x: instanceX + nodeDef.relativeX, // Calculate absolute world position
         y: instanceY + nodeDef.relativeY,
         originalDefinitionNodeId: nodeDef.id, // Link back to definition node if needed
         parent: null // Set below
         };
     });
      let instanceOutputNodes = definition.externalOutputNodes.map((nodeDef, i) => {
         const externalNodeId = `${instanceId}_out${i}`;
         const internalSourceNode = internalStructure.nodeMap.get(nodeDef.sourceInternalNodeId);
         if (internalSourceNode) {
              internalStructure.internalOutputMap.set(internalSourceNode.id, externalNodeId); // Map internal source to external output
         } else {
              console.warn(`Instance ${instanceId}: Could not find internal source node for external output ${nodeDef.sourceInternalNodeId}`);
         }
         return {
             id: externalNodeId, // Unique ID for this instance's node
         x: instanceX + nodeDef.relativeX, // Calculate absolute world position
         y: instanceY + nodeDef.relativeY,
         originalDefinitionNodeId: nodeDef.id,
         parent: null // Set below
         };
     });

     // Create the instance object
     const newInstance = {
         id: instanceId,
         type: definition.name, // Use the custom name as the type
         x: instanceX,
         y: instanceY,
         width: definition.width,
         height: definition.height,
         inputNodes: instanceInputNodes,
         outputNodes: instanceOutputNodes,
         // Store the cloned internal structure
         internalStructure: internalStructure,
         // Store definition name to look up internal structure later if needed for drawing/simulation
         definitionName: definition.name,
         // For now, simulation state is not handled for custom components
         value: undefined // Or manage input/output state differently
     };

     // Set parent reference on the nodes (pointing to the instance object itself)
     newInstance.inputNodes.forEach(n => n.parent = newInstance);
     newInstance.outputNodes.forEach(n => n.parent = newInstance);


     customComponentInstances.push(newInstance);
     console.log("Added custom component instance with internal structure:", newInstance);
     drawCircuit();
     // simulate(); // Don't simulate custom components yet
}

// --- Load Custom Components on Startup ---
function loadCustomDefinitions() {
    console.log("Loading custom component definitions from localStorage...");
    const savedDefinitions = localStorage.getItem('customComponents');
    if (savedDefinitions) {
        try {
            customComponentDefinitions = JSON.parse(savedDefinitions);
            console.log(`Loaded ${customComponentDefinitions.length} definitions.`);
            updateCustomComponentListUI(); // Update the sidebar
        } catch (error) {
            console.error("Error parsing custom component definitions from localStorage:", error);
            customComponentDefinitions = []; // Reset if data is corrupted
            localStorage.removeItem('customComponents'); // Clear corrupted data
        }
    } else {
        console.log("No saved custom component definitions found.");
    }
}

// Call loading function when the script initializes
loadCustomDefinitions();