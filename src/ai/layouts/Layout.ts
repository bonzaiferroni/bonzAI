import {BuildingPlannerData} from "../../interfaces";
import {Mem} from "../../helpers/Mem";

export abstract class Layout {

    public map: PositionMap;
    public fixedMap: BuildingPlannerData;
    protected roomName: string;
    protected anchor: Vector2;
    protected rotation: number;
    protected tempMap: {[controllerLevel: number]: PositionMap } = {};

    protected static mapCache: {[roomName: string]: PositionMap} = {};

    constructor(roomName: string, anchor: Vector2, rotation: number) {
        this.roomName = roomName;
        this.anchor = anchor;
        this.rotation = rotation;
    }

    public init(): boolean {
        if (!Layout.mapCache[this.roomName]) {
            RawMemory.setActiveSegments([LAYOUT_SEGMENTID]);
            let flexMapsString = RawMemory.segments[LAYOUT_SEGMENTID];
            if (!flexMapsString) {
                console.log(`ordering active segment for layout in ${this.roomName}`);
                return false;
            }
            let flexMaps = JSON.parse(flexMapsString);
            Layout.mapCache[this.roomName] = this.findMap(flexMaps[this.roomName]);
        }
        this.map = Layout.mapCache[this.roomName];
        return true;
    }

    protected findMap(flexMap: FlexMap): PositionMap {
        let structureTypes = Object.keys(CONSTRUCTION_COST);
        let map = {};
        for (let structureType of structureTypes) {
            let positions = [];
            let fixedPositions = this.fixedPositions(structureType);
            if (fixedPositions) {
                positions = positions.concat(fixedPositions);
            }
            let flexPositions = this.flexPositions(structureType, flexMap);
            if (flexPositions) {
                positions = positions.concat(flexPositions);
            }
            let tempPositions = this.tempPositions(structureType);
            if (tempPositions) {
                positions = positions.concat(tempPositions);
            }
            map[structureType] = positions;
        }
        return map;
    }

    public findFixedMap(): PositionMap {
        let structureTypes = Object.keys(CONSTRUCTION_COST);
        let map = {};
        for (let structureType of structureTypes) {
            map[structureType] = this.fixedPositions(structureType);
        }
        return map;
    }

    protected rotateDeltas(deltas: Vector2, rotation: number): Vector2 {
        let x = deltas.x;
        let y = deltas.y;
        if (rotation === 1) {
            x = -deltas.y;
            y = deltas.x;
        } else if (rotation === 2) {
            x = -deltas.x;
            y = -deltas.y;
        } else if (rotation === 3) {
            x = deltas.y;
            y = -deltas.x;
        }
        return {x: x, y: y};
    }

    protected fixedPosition(structureType: string, index: number): RoomPosition {
        if (!this.anchor || this.rotation === undefined) {
            console.log("no anchor or rotation specified");
            return;
        }

        let structureVector = this.fixedMap.buildings[structureType].pos[index];
        if (!structureVector) {
            return;
        }

        let deltas = {
            x: structureVector.x - this.fixedMap.pivot.x,
            y: structureVector.y - this.fixedMap.pivot.y,
        };

        deltas = this.rotateDeltas(deltas, this.rotation);
        let x = this.anchor.x + deltas.x;
        let y = this.anchor.y + deltas.y;
        return new RoomPosition(x, y, this.roomName);
    }

    protected fixedPositions(structureType: string): RoomPosition[] {
        if (!this.fixedMap) { return; }

        let structPositions = [];
        let map = this.fixedMap.buildings[structureType];
        if (!map) {
            return;
        }

        for (let i = 0; i < map.pos.length; i ++) {
            let position = this.fixedPosition(structureType, i);
            structPositions.push(position);
        }
        return structPositions;
    }

    protected flexPositions(structureType: string, flexMap: FlexMap): RoomPosition[] {
        if (!flexMap) { return; }
        let serializedPositions = flexMap[structureType];
        if (!serializedPositions) {
            return;
        }
        return Mem.deserializeIntPositions(serializedPositions, this.roomName);
    }

    protected tempPositions(structureType: string): RoomPosition[] {
        let room = Game.rooms[this.roomName];
        if (!room || !room.controller || !this.tempMap[room.controller.level]) { return; }
        return this.tempMap[room.controller.level][structureType];
    }
}

export type Vector2 = {x: number, y: number}
export type PositionMap = {[structureType: string]: RoomPosition[] }
export type FlexMap = {[structureType: string]: string }
export enum LayoutType { Quad, Mini, Flex } // 0 === Quad, 1 === Mini, 2 === Flex
export const LAYOUT_SEGMENTID = 33; // set this to a value that will work with your memory setup
export interface LayoutData {
    type: LayoutType;
    anchor: Vector2;
    rotation: number;
}
