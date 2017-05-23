import {Vector2} from "./Layout";
export class RoomMap<T> {

    private map: {[x: number]: {[y: number]: T}};

    constructor(data?: RoomMap<T>) {
        if (data) {
            this.map = data.map;
        } else {
            this.map = {};
        }
    }

    public setPos(pos: Vector2, value: T) {
        this.set(pos.x, pos.y, value);
    }

    public set(x: number, y: number, value: T) {
        if (!this.map[x]) { this.map[x] = {}; }
        this.map[x][y] = value;
    }

    public get(x: number, y: number): T {
        if (!this.map[x]) { return; }
        return this.map[x][y];
    }

    public findAnyInRange(location: Vector2, range: number, taper = 0): Vector2 {
        for (let xDelta = -range; xDelta <= range; xDelta++) {
            for (let yDelta = -range; yDelta <= range; yDelta++) {
                if (Math.abs(xDelta) + Math.abs(yDelta) > range * 2 - taper) { continue; }
                let x = location.x + xDelta;
                let y = location.y + yDelta;
                let value = this.get(x, y);
                if (value) { return {x: x, y: y}; }
            }
        }
    }
}