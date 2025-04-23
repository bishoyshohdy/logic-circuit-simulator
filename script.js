const canvas = document.getElementById('circuit-canvas');
const ctx = canvas.getContext('2d');

let gates = [];
let inputs = [];
let outputs = [];
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

// --- Get UI Elements for Indicators/Controls ---
const zoomLevelSpan = document.getElementById('zoom-level');
const offsetXSpan = document.getElementById('offset-x');
const offsetYSpan = document.getElementById('offset-y');

// --- Button Event Listeners ---
document.getElementById('add-and').addEventListener('click', () => addGate('AND'));
document.getElementById('add-or').addEventListener('click', () => addGate('OR'));
document.getElementById('add-not').addEventListener('click', () => addGate('NOT'));
document.getElementById('add-xor').addEventListener('click', () => addGate('XOR'));
document.getElementById('add-input').addEventListener('click', addInput);
document.getElementById('add-output').addEventListener('click', addOutput);
document.getElementById('simulate').addEventListener('click', simulate);
document.getElementById('reset').addEventListener('click', resetCircuit);
document.getElementById('delete-selected').addEventListener('click', deleteSelected);
// Add listeners for new view controls
document.getElementById('zoom-in').addEventListener('click', () => zoom(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoom(1 / 1.2));
document.getElementById('reset-view').addEventListener('click', resetView);

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
    const allComponents = [...gates, ...inputs, ...outputs];
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
    const allComponents = [...outputs, ...inputs, ...gates];
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

            // Update node positions for each dragged item
            const nodes = getNodePositions(item);
            item.inputNodes = nodes.inputs;
            item.outputNodes = nodes.outputs;

            // Update connections for each dragged item
            connections.forEach(conn => {
                if (conn.startNode.parent === item) {
                    conn.startX += dx;
                    conn.startY += dy;
                }
                if (conn.endNode.parent === item) {
                    conn.endX += dx;
                    conn.endY += dy;
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
        if (endNode && endNode.parent.inputNodes.includes(endNode) && endNode.parent !== startNode.parent) {
            const existingConnection = connections.find(c => c.endNode.id === endNode.id);
            if (!existingConnection) {
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
            } else {
                console.log('Input node already connected.');
            }
        } else {
            console.log('Connection cancelled or invalid endpoint.');
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
        const allComponents = [...gates, ...inputs, ...outputs];
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

function simulate() {
    console.log('Simulating circuit...');
    let nodeValues = new Map(); // Stores calculated value for each OUTPUT node ID
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100; // Prevent infinite loops

    // --- Initialization ---
    // 1. Clear previous simulation state (optional, could keep output values)
    outputs.forEach(o => o.value = undefined);
    // 2. Set initial values from Input components
    inputs.forEach(input => {
        if (input.outputNodes && input.outputNodes.length > 0) {
            nodeValues.set(input.outputNodes[0].id, input.value);
        }
    });
    // 3. Initialize all gate output nodes to undefined (or a default like 0)
    gates.forEach(gate => {
        gate.outputNodes.forEach(node => nodeValues.set(node.id, undefined)); 
    });

    // --- DEBUG: Log initial values ---
    console.log("  [Simulate] Initial nodeValues:", Object.fromEntries(nodeValues));

    // --- Simulation Loop ---
    while (changed && iterations < MAX_ITERATIONS) {
        changed = false;
        iterations++;

        gates.forEach(gate => {
            // Get input values for this gate
            let inputVals = gate.inputNodes.map(inputNode => {
                // Find connection based on the END node's ID matching the gate's input node ID
                const connection = connections.find(c => c.endNode.id === inputNode.id); 
                if (connection) {
                    // Value comes from the connected output node
                    const sourceNodeId = connection.startNode.id;
                    const value = nodeValues.get(sourceNodeId);
                    // --- DEBUG: Log input lookup ---
                    // console.log(`    [Simulate] Gate ${gate.id} reading input for ${inputNode.id} from source ${sourceNodeId}. Value = ${value}`);
                    return value;
                } else {
                     // --- DEBUG: Log unconnected input ---
                     // console.log(`    [Simulate] Gate ${gate.id} input ${inputNode.id} is unconnected.`);
                    return 0; 
                }
            });

            // Skip calculation if any input is undefined (unless it's a NOT gate)
            if (gate.type !== 'NOT' && inputVals.some(v => v === undefined)) {
                // Wait for inputs to be determined in a later iteration
                return; 
            }
            if (gate.type === 'NOT' && inputVals[0] === undefined) {
                 return;
            }

            let outputVal = undefined;
            
            // Calculate output based on gate type
            try { 
                switch (gate.type) {
                    case 'AND':
                        outputVal = (inputVals[0] === 1 && inputVals[1] === 1) ? 1 : 0;
                        // DEBUG: Log AND gate calculation
                        if (gate.type === 'AND') {
                            console.log(`  [Simulate] Gate ${gate.id} (AND): Inputs=${inputVals}, Output=${outputVal}`);
                        }
                        break;
                    case 'OR':
                        outputVal = (inputVals[0] === 1 || inputVals[1] === 1) ? 1 : 0;
                        break;
                    case 'XOR':
                        outputVal = (inputVals[0] !== inputVals[1]) ? 1 : 0;
                        break;
                    case 'NOT':
                        outputVal = (inputVals[0] === 0) ? 1 : 0;
                        break;
                }
            } catch (error) {
                console.error(`Error calculating gate ${gate.id}:`, error);
                outputVal = undefined; // Set to undefined on error
            }

            // Update node value if changed
            const outputNode = gate.outputNodes[0];
            if (nodeValues.get(outputNode.id) !== outputVal && outputVal !== undefined) {
                nodeValues.set(outputNode.id, outputVal);
                 // DEBUG: Log node value update
                console.log(`  [Simulate] Node ${outputNode.id} updated to: ${outputVal}`);
                changed = true;
            }
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
            finalValue = (sourceNodeValue === undefined) ? 0 : sourceNodeValue; 
        } else {
             // DEBUG: Log unconnected output
             // console.log(`  [Simulate] Output ${output.id} is unconnected.`);
             finalValue = 0; // Unconnected output shows 0
        }
        output.value = finalValue;
         // DEBUG: Log final output component value
        // console.log(`  [Simulate] Setting Output ${output.id} value to: ${output.value}`);

    });

    // console.log('Simulation complete.'); // DEBUG
    drawCircuit(); // Redraw to show updated output values
}

function resetCircuit() {
    console.log('Resetting circuit');
    gates = [];
    inputs = [];
    outputs = [];
    connections = [];
    nextId = 0;
    selectedItems = []; // Clear selection array
    resetView(); // Reset view as part of full reset
    // No need to call drawCircuit/updateStatus here, resetView does it
}

function deleteSelected() {
    if (selectedItems.length === 0) { // Check if array is empty
        console.log('Nothing selected to delete.');
        return;
    }

    console.log(`Deleting ${selectedItems.length} items.`);
    const itemsToDeleteIds = selectedItems.map(item => item.id);

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
    [...gates, ...inputs, ...outputs].forEach(component => {
        // Check if the current component is in the selectedItems array
        const isSelected = selectedItems.some(item => item.id === component.id);
        ctx.lineWidth = (isSelected ? 3 : 1) * scaledLineWidth; 
        ctx.strokeStyle = isSelected ? '#007bff' : '#333';

        // Draw gate body (using world x/y)
        if (component.type !== 'INPUT' && component.type !== 'OUTPUT') {
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
            ctx.fillStyle = component.value === 1 ? '#90EE90' : '#F08080';
            ctx.beginPath();
            ctx.rect(component.x, component.y, component.width, component.height);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#333';
            ctx.fillText(`IN ${component.value}`, component.x + component.width / 2, component.y + component.height / 2);
        }
        // Draw output body (using world x/y)
        else if (component.type === 'OUTPUT') {
            ctx.fillStyle = component.value === 1 ? '#90EE90' : (component.value === 0 ? '#F08080' : '#ddd');
            ctx.beginPath();
            ctx.arc(component.x + component.width / 2, component.y + component.height / 2, component.width / 2, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#333';
            const outputText = component.value === undefined ? 'OUT' : `OUT=${component.value}`;
            ctx.fillText(outputText, component.x + component.width / 2, component.y + component.height / 2);
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
            nodes.inputs.push({ id: `${component.id}_in0`, x: component.x, y: component.y + component.height * 0.25, parent: component });
            nodes.inputs.push({ id: `${component.id}_in1`, x: component.x, y: component.y + component.height * 0.75, parent: component });
            nodes.outputs.push({ id: `${component.id}_out0`, x: component.x + component.width, y: cy, parent: component });
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