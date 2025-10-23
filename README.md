# 📡 Line-of-Sight Tool

A simple web app to help determine the best placement for mesh network nodes.

---

## 🚀 Features

- **Browser-based** — all data is processed locally (no server upload required).  
- **Interactive map** — visualize node connections using Leaflet.  
- **CSV input** — easily configure and test multiple nodes.  
- **Privacy-focused** — no analytics or trackers.  
- **Terrain data** loaded directly from GitHub.

---

## 🧭 Usage

1. **Download** the sample comma-delimited file (`.csv`).
2. **Rename** the file using the name of the node you want to analyze.
3. **Do not modify** the header row.
4. **Edit** the second line with your node’s details:
   - `lat` — latitude  
   - `lon` — longitude  
   - `antenna_height` — height in **meters**
5. **Add** the other nodes you want to test against in the following lines.
6. **Upload** your updated CSV file in the web app.
7. Click **Process** to view the line-of-sight results.

---

## 🖼️ Example

Example CSV format:

```csv
Location Name,Latitude,Longitude,Height
Base Node,37.7749,-122.4194,10
NodeB,37.7840,-122.4090,8
NodeC,37.7640,-122.4290,12

