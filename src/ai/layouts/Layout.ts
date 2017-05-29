import {BuildingPlannerData} from "../../interfaces";
import {MemHelper} from "../../helpers/MemHelper";
import {LayoutDisplay} from "./LayoutDisplay";
import {empire} from "../Empire";

export abstract class Layout {

    public map: PositionMap;
    public fixedMap: BuildingPlannerData;
    protected roomName: string;
    protected anchor: Vector2;
    protected rotation: number;
    protected tempMap: {[controllerLevel: number]: PositionMap };
    protected data: LayoutData;
    protected structureCache: {[structureType: string]: Structure[]};

    constructor(roomName: string, data: LayoutData) {
        this.roomName = roomName;
        this.anchor = data.anchor;
        this.rotation = data.rotation;
        this.data = data;
    }

    public init(): boolean {
        if (!this.data.flex) {
            let generating = this.generateFlex();
            if (generating) {
                console.log(`LAYOUT: generating flex map in ${this.roomName}`);
                return;
            }
        }

        let flexMaps = empire.archiver.globalGet(LAYOUT_SEGMENTID);
        if (!flexMaps) {
            console.log(`ordering layout segment in ${this.roomName}`);
            return false;
        }

        this.map = this.findMap(flexMaps[this.roomName]);
        return true;
    }

    public refresh() {
        this.structureCache = {};
    }

    public findFixedMap(): PositionMap {
        let structureTypes = Object.keys(CONSTRUCTION_COST);
        structureTypes.push("empty");
        let map = {};
        for (let structureType of structureTypes) {
            let positions = this.fixedPositions(structureType);
            if (!positions) { continue; }
            map[structureType] = positions;
        }
        return map;
    }

    public findStructures<T extends Structure>(structureType: string): T[] {
        if (this.structureCache[structureType]) { return this.structureCache[structureType] as any; }

        let structures = [];
        let room = Game.rooms[this.roomName];
        let positions = this.map[structureType];
        if (!positions && !room) { return []; }
        for (let position of positions) {
            let structure = position.lookForStructure(structureType);
            if (!structure) { continue; }
            structures.push(structure);
        }

        this.structureCache[structureType] = structures;
        return structures;
    }

    public getAnchorPos() {
        return new RoomPosition(this.anchor.x, this.anchor.y, this.roomName);
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
        return MemHelper.deserializeIntPositions(serializedPositions, this.roomName);
    }

    protected tempPositions(structureType: string): RoomPosition[] {
        if (!this.tempMap) { return; }
        let room = Game.rooms[this.roomName];
        if (!room || !room.controller || !this.tempMap[room.controller.level]) { return; }
        return this.tempMap[room.controller.level][structureType];
    }

    protected generateFlex() {
        this.data.flex = true;
        return false;
    }
}

export type Vector2 = {x: number, y: number}
export type PositionMap = {[structureType: string]: RoomPosition[] }
export type FlexMap = {[structureType: string]: string }

// deprecated, use constants instead
export enum LayoutType { Quad, Mini, Flex } // 0 === Quad, 1 === Mini, 2 === Flex

export const LAYOUT_SEGMENTID = 33; // set this to a value that will work with your memory setup
export interface LayoutData {
    type: string;
    anchor: Vector2;
    rotation: number;
    flex?: boolean;
}

export const LAYOUT_QUAD = "quad";
export const LAYOUT_FLEX = "flex";
export const LAYOUT_MINI = "mini";
export const LAYOUT_SWAP = "swap";
export const LAYOUT_CUSTOM = "custom";
