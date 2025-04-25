# Logic Circuit Simulator

A simple web-based application built with HTML, CSS, and vanilla JavaScript (using the Canvas API) to design and simulate basic digital logic circuits.

<!-- Optional: Add a screenshot/GIF here -->
<!-- ![Screenshot](docs/screenshot.png) -->

## Features

*   **Component Palette:**
    *   Add Input sources (toggleable 0/1).
    *   Add Output probes (display result).
    *   Add Clock sources (toggle 0/1 at a user-defined frequency).
    *   Add basic logic gates: AND, OR, NOT, XOR, NAND, NOR.
*   **Custom Components:**
    *   Select a group of connected components (including Inputs/Outputs defining the interface).
    *   Save the selection as a reusable, named Custom Component.
    *   Custom components appear in the sidebar under "Custom".
    *   Add instances of saved custom components to the canvas.
    *   Custom component definitions are saved in the browser's LocalStorage and reloaded on startup.
    *   Delete custom component definitions (and all their instances) using the 'X' button in the sidebar.
*   **Canvas Interface:**
    *   Drag and drop components to arrange the circuit.
    *   Click on Input components to toggle their state (0/1).
    *   Connect components by clicking and dragging from an output node (right side) to an input node (left side).
    *   Pan the view by clicking and dragging with the middle mouse button.
    *   Zoom the view using the mouse wheel or the +/- buttons.
*   **Selection:**
    *   Click a component to select it.
    *   Hold **Shift** and click components to add/remove them from the selection.
    *   Click and drag on the background to create a marquee selection box (hold Shift to add to selection).
*   **Editing:**
    *   Delete selected components using the **Delete** key or the "Delete Selected" button.
    *   Copy selected components with **Ctrl+C**.
    *   Paste copied components near the center of the view with **Ctrl+V** (connections are not copied).
*   **Simulation:**
    *   Continuous simulation: Circuit state updates automatically whenever an input changes, a clock ticks, or the circuit structure is modified.
    *   Output components display the calculated result (0 or 1, or '-' if undefined).
    *   Custom components are simulated based on their internal saved structure.
*   **View Controls:**
    *   Zoom buttons (+/-).
    *   "Home" button to reset the view (pan/zoom).
    *   Status indicators display the current zoom level and pan offset.
*   **Reset:** Clear the entire circuit (including custom definitions) and reset the view using the "Reset Circuit" button.

## How to Use

1.  **Add Components:** Use the buttons in the left sidebar to add inputs, outputs, clocks, or logic gates. They will appear near the center of your current view. For Clocks, you'll be prompted for the period in milliseconds.
2.  **Arrange:** Click and drag components to position them.
3.  **Connect:** Click and hold on an output node (small circle on the right of an input, clock, or gate), drag the line to an input node (small circle on the left of a gate or output), and release.
4.  **Set Inputs:** Click on the square "INPUT" components to toggle their value between 0 (red) and 1 (green).
5.  **Observe Simulation:** The simulation runs automatically. Output components (circles) and Clock components will update their color and text based on the circuit state.
6.  **Navigate:**
    *   Use the mouse wheel or +/- buttons to zoom.
    *   Hold the middle mouse button and drag to pan.
    *   Click "Home" to reset the view.
7.  **Select & Edit:**
    *   Click to select one component.
    *   Shift+Click or drag a box to select multiple.
    *   Press Delete or the "Delete Selected" button to remove selected items.
    *   Use Ctrl+C and Ctrl+V to copy/paste selected items (excluding custom components).
8.  **Custom Components:**
    *   **Create:** Select the gates, inputs, and outputs that make up your desired component. Ensure the selection includes at least one INPUT or OUTPUT block to define the external interface. Click "Save Selection". Enter a unique name.
    *   **Use:** The saved component name will appear in the sidebar under "Custom". Click its button to add an instance to the canvas.
    *   **Delete:** Click the 'X' button next to a custom component's name in the sidebar to remove its definition and all instances from the circuit and LocalStorage.

## How to Run

1.  Clone or download this repository.
2.  Open the `index.html` file directly in a modern web browser (like Chrome, Firefox, Edge, Safari).

## Future Enhancements (Ideas)

*   Ability to modify Clock frequency after creation.
*   Visual indication of signal state (0/1) on wires.
*   Ability to delete individual connections.
*   Labels for components.
*   Saving and loading entire circuits (including custom components) to/from files.
*   Multi-output nodes / wire splitting.
*   Improved styling and visual feedback (hover effects, node highlighting).
*   Support for nested custom components.
*   More gate types (e.g., buffers, tri-state buffers).
*   Undo/Redo functionality.
