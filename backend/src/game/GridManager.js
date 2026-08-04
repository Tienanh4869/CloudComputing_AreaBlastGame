const CELL_SIZE = 1000;
const MAP_SIZE = 3500;

function getCell(x, y) {
  const col = Math.floor(Math.max(0, Math.min(x, MAP_SIZE - 1)) / CELL_SIZE);
  const row = Math.floor(Math.max(0, Math.min(y, MAP_SIZE - 1)) / CELL_SIZE);
  return { col, row, id: `${col}_${row}` };
}

function getSurroundingCells(col, row) {
  const cells = [];
  const maxCol = Math.ceil(MAP_SIZE / CELL_SIZE) - 1;
  const maxRow = Math.ceil(MAP_SIZE / CELL_SIZE) - 1;

  for (let c = col - 1; c <= col + 1; c++) {
    for (let r = row - 1; r <= row + 1; r++) {
      if (c >= 0 && c <= maxCol && r >= 0 && r <= maxRow) {
        cells.push(`${c}_${r}`);
      }
    }
  }
  return cells;
}

module.exports = { getCell, getSurroundingCells, CELL_SIZE, MAP_SIZE };
