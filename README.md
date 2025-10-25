# 📡 Line-of-Sight Tool

A simple web app to help determine the best placement for mesh network nodes.
Click here to use it:  https://thatsfguy.github.io/Line-Of-Sight-Tool/
Or download the repo and use it on your own machine.
Terrain files of the continuous 48 States are included.  Others you need to download yourself.
Pull requests are welcome.
---

## 🚀 Features

- **Browser-based** — all data is processed locally (no server upload required).  
- **Interactive map** — visualize node connections using Leaflet.  
- **CSV input** — easily configure and test multiple nodes.  
- **Privacy-focused** — no analytics or trackers.  
- **Terrain data** loaded directly from GitHub.

---

## 🧭 Usage

# Instructions for Using the RF Line-of-Sight Tool (910 MHz) and Node Manager

The **RF Line-of-Sight Tool (910 MHz)** is a web-based application for analyzing line-of-sight (LOS) for radio frequency (RF) propagation at 910 MHz, used in conjunction with the **Node Manager**. The Node Manager allows you to create, edit, and organize nodes (locations with geographic coordinates and attributes) and groups for LOS analysis. A group consists of one **Primary Node** and one or more **Secondary Nodes** (marked with the "Include" checkbox). Groups are automatically named after the Primary Node, with no option to customize the group name. The LOS tool calculates visibility from the Primary Node to each Secondary Node in a group, displaying results as "clear" or "obstructed" and visualizing paths on a Leaflet map. Data is stored in your browser's localStorage, so export it as a CSV file regularly to avoid loss when clearing your cache or switching devices.

- **Node Manager**: [https://thatsfguy.github.io/Line-Of-Sight-Tool/nodemgr.html](https://thatsfguy.github.io/Line-Of-Sight-Tool/nodemgr.html)
- **RF Line-of-Sight Tool**: [https://thatsfguy.github.io/Line-Of-Sight-Tool/index.html](https://thatsfguy.github.io/Line-Of-Sight-Tool/index.html)

## Getting Started
1. **Open the Node Manager**: Load the Node Manager page in your browser. You'll see two main sections: **Nodes** and **Groups**, each with a table for managing data.
2. **Backup Reminder**: A note at the top of both tools warns that data is stored in localStorage. To export:
   - In Node Manager, find the "Download CSV" button (typically near the top or in the Nodes section).
   - Click to save your nodes and groups as a CSV file. Import this file later to restore data.
3. **Map Interaction**: Node Manager includes an interactive Leaflet map. Use it to place and edit nodes:
   - **Click on the map** to set Latitude (Lat) and Longitude (Lng) for a new or selected node.
   - **Click a marker** (pin) on the map to edit that node's details.

## Managing Nodes in Node Manager
Nodes represent locations (e.g., antennas) with attributes like position, height, and notes, used for LOS calculations.

### Adding a Node
1. Fill in the node details in the provided form:
   - **Location Name**: Enter a descriptive name (e.g., "Tower A").
   - **Latitude/Longitude**: Type values manually (e.g., 37.7749, -122.4194) or click on the map to auto-fill.
   - **Height (m)**: Enter the elevation above ground in meters (e.g., 50 for a 50m tower).
   - **Notes**: Add optional details (e.g., "VHF antenna installed").
2. Click **Add Node** to save. The node appears in the Nodes table, and a marker is added to the map.

### Editing a Node
1. In the Nodes table, click the **Edit** icon/button in the **Actions** column (likely a pencil icon).
   - Alternatively, click the node's marker on the map.
2. Update fields as needed (e.g., drag the marker to change coordinates).
3. Click **Save** to apply changes. The table and map update automatically.

### Deleting a Node
1. In the **Actions** column, click the **Delete** icon/button (likely a trash can).
2. Confirm deletion. The node is removed from the table and any associated groups.

### Nodes Table Columns
| Column       | Description |
|--------------|-------------|
| **Include** | Checkbox to mark the node as a Secondary Node for LOS calculations in a group. |
| **Primary** | Checkbox to designate the node as the Primary Node for LOS calculations in a group. Only one node per group can be Primary. |
| **Location Name** | Editable text field for the node's name. |
| **Latitude** | Numeric field for north-south position (e.g., 37.7749). |
| **Longitude** | Numeric field for east-west position (e.g., -122.4194). |
| **Height (m)** | Numeric field for elevation above ground (in meters). |
| **Notes**    | Text area for free-form details. |
| **Actions**  | Buttons for Edit/Delete. |

## Managing Groups in Node Manager
Groups are used to process LOS plots at 910 MHz. Each group consists of one **Primary Node** and one or more **Secondary Nodes** (marked with the "Include" checkbox). Groups are automatically named after the Primary Node, with no option to customize the name.

### Adding a Group
1. In the Nodes table, check the **Primary** box for the node to serve as the Primary Node (only one per group). The group will be named after this node.
2. Check the **Include** boxes for nodes to include as Secondary Nodes.
3. Click **Create Group** to create the group.
4. If a group with the same Primary Node already exists, a popup will prompt you to confirm overwriting the existing group. Click **OK** to overwrite, or cancel to abort. The new group appears in the Groups table, named after the Primary Node.

### Editing a Group
1. In the Nodes table, select a new **Primary** node or adjust the **Include** checkboxes for Secondary Nodes.
2. Click **Create Group**.
3. A popup will prompt you to confirm overwriting the existing group associated with the selected Primary Node. Click **OK** to overwrite, or cancel to abort. If overwritten, the group name updates automatically to match the new Primary Node.

### Deleting a Group
1. In the Groups table, click the **Delete** icon/button in the **Actions** column.
2. Confirm. This removes the group but keeps the nodes intact.

### Groups Table Columns
| Column          | Description |
|-----------------|-------------|
| **Group Name** | Automatically set to the Primary Node's name (not editable). |
| **Included Nodes** | Displays the Primary Node and Secondary Nodes. |
| **Actions**    | Buttons for Delete. |

## Running Line-of-Sight Analysis
In the RF Line-of-Sight Tool ([https://thatsfguy.github.io/Line-Of-Sight-Tool/index.html](https://thatsfguy.github.io/Line-Of-Sight-Tool/index.html)), select a group for analysis using the **Data Source** option, which offers two radio buttons:

1. **CSV File**:
   - Select the "CSV File" radio button.
   - An upload option appears. Click to upload a CSV file created manually or exported from Node Manager (using the "Download CSV" button).
   - The tool loads the group data from the CSV for analysis.

2. **Group from Node Manager**:
   - Select the "Group from Node Manager" radio button.
   - A picklist appears, listing groups stored in localStorage, each named after its Primary Node.
   - Select the desired group from the picklist. No CSV upload is needed.

3. **Running the Analysis**:
   - After selecting a group (via CSV or picklist), ensure it has one Primary Node and at least one Secondary Node.
   - Initiate the analysis (e.g., click a "Run" or "Analyze" button).
   - The tool will:
     - Calculate LOS at 910 MHz from the Primary Node to each Secondary Node.
     - Display results as "clear" (visible) or "obstructed" (blocked by terrain or obstacles).
     - Visualize the paths on a Leaflet map, with lines indicating clear or obstructed paths.

## Tips and Best Practices
- **Map Usage**: In Node Manager, zoom/pan the Leaflet map for precise node placement. Markers may be color-coded (e.g., Primary Node in red).
- **Group Setup**: Ensure exactly one node is marked as **Primary** per group and at least one node is marked as **Include** for LOS calculations. The group name automatically matches the Primary Node.
- **Data Persistence**: Data saves to localStorage—no login needed. Export CSV from Node Manager after significant changes to avoid data loss.
- **LOS Analysis**:
  - Accurate node heights and coordinates are critical for reliable RF LOS calculations at 910 MHz.
  - Obstructions (e.g., hills, buildings) are factored in based on terrain data used by the tool.
- **Troubleshooting**:
  - If the map fails to load, verify your internet connection (uses Leaflet).
  - No LOS results? Confirm the group has a Primary Node and at least one Secondary Node, and check that the group was loaded correctly (via CSV or picklist).
  - For bulk import: Use the "Import CSV" feature in Node Manager to restore previously exported data.
- **Limitations**: This is a client-side tool with no cloud sync. Desktop browsers provide the best experience.

For issues or advanced features, check the GitHub repo or page source for updates. Happy RF mapping!
