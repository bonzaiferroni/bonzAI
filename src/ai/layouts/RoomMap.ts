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

    public getPos(pos: RoomPosition): T {
        return this.get(pos.x, pos.y);
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

    public getPositions(value: T, roomName: string): RoomPosition[] {
        let positions = [];
        for (let x in this.map) {
            for (let y in this.map[x]) {
                if (this.map[x][y] !== value) { continue; }
                positions.push(new RoomPosition(Number.parseInt(x), Number.parseInt(y), roomName));
            }
        }
        return positions;
    }

    public getAllPositions(roomName: string): {[valueName: string]: RoomPosition[] } {
        let positions = {};
        for (let x in this.map) {
            for (let y in this.map[x]) {
                let value = this.map[x][y];
                if (!value) { continue; }
                if (!positions[value.toString()]) { positions[value.toString()] = []; }
                positions[value.toString()].push(new RoomPosition(Number.parseInt(x), Number.parseInt(y), roomName));
            }
        }
        return positions;
    }
}