import {RaidMission} from "./RaidMission";
import {WorldMap} from "../WorldMap";
import {BoostLevel} from "../../interfaces";
import {Agent} from "../agents/Agent";
import {Viz} from "../../helpers/Viz";
import {FireflyMission} from "./FireflyMission";
import {helper} from "../../helpers/helper";
import {TravelToOptions} from "../Traveler";
import {RaidAgent} from "../agents/RaidAgent";
export class LongbowMission extends FireflyMission {

    private static tactics: {
        tick: number,
        attackers: Agent[],
        healers: Agent[],
        positionedHealers: Agent[],
        positionedAttackers: Agent[],
        positioningAttackers: Agent[],
        attackerPositioning: boolean,
    } = {} as any;
    private targetFlag: Flag;
    private positions: {
        inside?: RoomPosition,
        outside?: RoomPosition,
    } = {};
    private squire: Agent;
    private claimedHealerSlots: RoomPosition[] = [];

    public initMission() {
        super.update();
        this.targetFlag = Game.flags[`${this.operation.name}_longbow`];
        if (!this.targetFlag) {
            return;
        }
        this.positions = this.findExitPos(this.targetFlag.pos);
        Viz.colorPos(this.positions.inside, "blue");
        Viz.colorPos(this.positions.outside, "blue");
    }

    public roleCall() {
        super.roleCall();

        if (LongbowMission.tactics.tick !== Game.time) {
            LongbowMission.tactics.tick = Game.time;
            LongbowMission.tactics.attackers = [];
            LongbowMission.tactics.healers = [];
            LongbowMission.tactics.positionedHealers = [];
            LongbowMission.tactics.positionedAttackers = [];
            LongbowMission.tactics.positioningAttackers = [];
            LongbowMission.tactics.attackerPositioning = true;
        }

        if (this.attacker && this.attacker.memory.entryReady) {
            LongbowMission.tactics.attackers.push(this.attacker);
        }

        if (this.healer && this.healer.memory.entryReady) {
            LongbowMission.tactics.healers.push(this.healer);
        }

        this.squire = _.head(this.headCount("squire", this.attackerBody, () => this.targetFlag ? 1 : 0, {
            memory: { boosts: this.attackerBoosts },
        }));

        if (this.squire && this.squire.memory.entryReady) {
            LongbowMission.tactics.attackers.push(this.squire);
        }
    }

    public specialActions() {
        if (!this.targetFlag) {
            return super.specialActions();
        } else {
            return false;
        }
    }

    public missionActions() {
        super.actions();
        if (!this.squire) { return; }

        this.attackCreeps(this.squire);
        this.attackStructure(this.squire);

        if (!this.squire.memory.entryReady) {
            if (this.squire.pos.inRangeTo(this.raidData.fallbackFlag, 5) && !this.squire.pos.isNearExit(0)) {
                this.squire.memory.entryReady = true;
            } else {
                this.squire.travelWaypoints(this.raidWaypoints);
                return;
            }
        }

        if (this.raidOperation.memory.fallback) {
            this.longBowTravel(this.squire, this.raidData.fallbackFlag);
        }

        this.attackerEntryActions(this.squire);
    }

    public finalizeMission() {
        super.finalize();
        this.memory.cache.positionedHealerCount = LongbowMission.tactics.positionedHealers.length;
        this.memory.cache.positioningAttackersCount = LongbowMission.tactics.positioningAttackers.length;
    }

    protected entryActions(): boolean {
        this.attacker.memory.entryReady = true;
        this.healer.memory.entryReady = true;

        // if target flag is removed, the raid will function like firefly
        if (!this.targetFlag) { return super.entryActions(); }
        if (LongbowMission.tactics.healers.length < 2) {
            this.longBowTravel(this.healer, this.raidData.fallbackFlag);
            this.longBowTravel(this.attacker, this.raidData.fallbackFlag);
            return true;
        }
        this.attackerEntryActions(this.attacker);
        this.healerEntryActions(this.healer);
        return true;
    }

    private findExitPos(pos: RoomPosition): {inside: RoomPosition, outside: RoomPosition } {
        let distances = {
            west: pos.x,
            east: 49 - pos.x,
            south: 49 - pos.y,
            north: pos.y,
        };

        let bestDirection: string;
        let shortestDistance = Number.MAX_VALUE;
        for (let direction in distances) {
            let distance = distances[direction];
            if (distance > shortestDistance) { continue; }
            bestDirection = direction;
            shortestDistance = distance;
        }

        if (bestDirection === "west") {
            return {
                inside: new RoomPosition(0, pos.y, pos.roomName),
                outside: new RoomPosition(49, pos.y, this.raidData.fallbackFlag.pos.roomName),
            };
        }
        if (bestDirection === "east") {
            return {
                inside: new RoomPosition(49, pos.y, pos.roomName),
                outside: new RoomPosition(0, pos.y, this.raidData.fallbackFlag.pos.roomName),
            };
        }
        if (bestDirection === "north") {
            return {
                inside: new RoomPosition(pos.x, 0, pos.roomName),
                outside: new RoomPosition(pos.x, 49, this.raidData.fallbackFlag.pos.roomName),
            };
        }
        if (bestDirection === "south") {
            return {
                inside: new RoomPosition(pos.x, 49, pos.roomName),
                outside: new RoomPosition(pos.x, 0, this.raidData.fallbackFlag.pos.roomName),
            };
        }
    }

    private attackerEntryActions(attacker: Agent) {
        if (this.memory.cache.positionedHealerCount < 2
            || LongbowMission.tactics.positionedAttackers.length >= 14) {
            this.longBowTravel(attacker, this.raidData.fallbackFlag);
            return;
        }

        let destination = this.positions.outside;
        if (attacker.room === this.raidData.attackRoom) {
            destination = this.positions.inside;
        }

        if (attacker.pos.isNearExit(0)) {
            if (attacker.pos.inRangeTo(destination, 3)) {
                LongbowMission.tactics.positionedAttackers.push(attacker);
                this.repositionOnExit(attacker, destination);
                return;
            }
            if (attacker.room === this.raidData.attackRoom) {
                return;
            } else {
                attacker.moveOffExit();
            }
        }

        LongbowMission.tactics.positioningAttackers.push(attacker);
        let slot: RoomPosition;
        if (attacker.pos.isNearExit(2)) {
            slot = this.findSlot(attacker, destination);
        }

        if (!slot) {
            if (attacker.room === this.raidData.attackRoom) {
                slot = this.raidData.fallbackFlag.pos;
            } else {
                slot = this.positions.outside;
            }
        }

        this.longBowTravel(attacker, slot);
    }

    private healerEntryActions(healer: Agent) {
        if (LongbowMission.tactics.healers.length < 2 || LongbowMission.tactics.positionedHealers.length >= 7) {
            this.longBowTravel(healer, this.raidData.fallbackFlag);
            return;
        }

        if (healer.pos.isNearExit(0)) {
            if (healer.room !== this.raidData.attackRoom) {
                console.log(healer.moveOffExit());
            }
            return;
        }

        let healerSlots = this.findHealerSlots(this.positions.outside);
        let slotted = healer.pos.getRangeToClosest(healerSlots) === 0;
        let range = healer.pos.getRangeTo(this.positions.outside);
        let betterSlot = _(healerSlots)
            .filter(x => !_.includes(this.claimedHealerSlots, x))
            .filter(x => x.lookFor(LOOK_CREEPS).length === 0)
            .filter(x => !slotted || x.getRangeTo(this.positions.outside) < range)
            .sortBy(x => x.getRangeTo(this.positions.outside))
            .head();
        if (betterSlot) {
            this.longBowTravel(healer, betterSlot);
            this.claimedHealerSlots.push(betterSlot);
        }

        if (healer.pos.inRangeTo(this.positions.outside, 3)) {
            LongbowMission.tactics.positionedHealers.push(healer);
        }
    }

    private repositionOnExit(attacker: Agent, destination: RoomPosition) {
        let range = attacker.pos.getRangeTo(destination);
        if (range === 0) { return; }
        let betterPosition = _(this.findAttackerSlots(destination))
            .filter(x => x.isNearTo(attacker))
            .filter(x => x.getRangeTo(destination) < range)
            .filter(x => x.lookFor(LOOK_CREEPS).length === 0)
            .head();
        if (betterPosition) {
            this.longBowTravel(attacker, betterPosition);
        }
    }

    private findSlot(attacker: Agent, destination: RoomPosition): RoomPosition {
        if (attacker.memory.slot) {
            let slot = helper.deserializeRoomPosition(attacker.memory.slot);
            let findNewSlot = false;
            if (attacker.pos.isNearTo(slot)) {
                if (Game.time > attacker.memory.slotDelay) {
                    findNewSlot = true;
                } else if (attacker.memory.slotDelay === undefined) {
                    attacker.memory.slotDelay = Game.time + 2;
                }
            }
            if (slot && !findNewSlot) {
                return slot;
            } else {
                attacker.memory.slotDelay = undefined;
                attacker.memory.slot = undefined;
                return this.findSlot(attacker, destination);
            }
        } else {
            let slots = this.findAttackerSlots(destination);
            let bestSlot = _(slots)
                .filter(x => x.lookFor(LOOK_CREEPS).length === 0)
                .sortBy(x => x.getRangeTo(destination))
                .head();
            if (bestSlot) {
                attacker.memory.slot = bestSlot;
            }
        }
    }

    private findAttackerSlots(destination: RoomPosition): RoomPosition[] {
        if (this.cache.slots) {
            if (this.cache.slots[destination.roomName]) {
                return this.cache.slots[destination.roomName];
            }
        } else {
            this.cache.slots = {};
        }

        let slots: RoomPosition[] = [destination];
        let directions = [1, 3, 5, 7];
        for (let direction of directions) {
            let lastPos = destination;
            for (let i = 0; i < 3; i++) {
                let nextPos = lastPos.getPositionAtDirection(direction);
                if (!nextPos.isNearExit(0)) { break; }
                if (nextPos.isNearExit(-1)) { break; }
                if (Game.map.getTerrainAt(nextPos) === "wall") { break; }
                slots.push(nextPos);
                lastPos = nextPos;
            }
        }

        this.cache.slots[destination.roomName] = slots;
        return slots;
    }

    private findHealerSlots(destination: RoomPosition): RoomPosition[] {
        if (this.cache.healerSlots) {
            return this.cache.healerSlots;
        }

        let slots: RoomPosition[];
        if (this.memory.cache.positioningAttackersCount > 0) {
            slots = this.findDiagonalSlots(destination);
        } else {
            slots = this.findStraightSlots(destination);
        }

        this.cache.healerSlots = slots;
        return slots;
    }

    private findDiagonalSlots(destination: RoomPosition): RoomPosition[] {
        let slots: RoomPosition[] = [];
        let directions = [2, 4, 6, 8];
        let tested = [{pos: destination}];
        let testFromPositions = [destination];
        while (testFromPositions.length > 0) {
            let testFromPosition = testFromPositions.pop();
            for (let direction of directions) {
                let testSlot = testFromPosition.getPositionAtDirection(direction);
                if (testSlot.getRangeToClosest(tested) === 0) { continue; }
                if (testSlot.isNearExit(0)) { continue; }
                if (!testSlot.isNearExit(2)) { continue; }
                if (!testSlot.inRangeTo(destination, 3)) { continue; }
                Viz.colorPos(testSlot, "yellow", .2);
                slots.push(testSlot);
                tested.push({pos: testSlot});
                testFromPositions.push(testSlot);
            }
        }
        return slots;
    }

    private findStraightSlots(destination: RoomPosition): RoomPosition[] {
        let orientation = _([1, 3, 5, 7])
            .map(x => destination.getPositionAtDirection(x))
            .filter(x => !x.isNearExit(0))
            .filter(x => x.isNearExit(1))
            .head();

        let slots: RoomPosition[] = [orientation];
        let directions = [1, 3, 5, 7];
        for (let direction of directions) {
            let lastPos = orientation;
            for (let i = 0; i < 3; i++) {
                let nextPos = lastPos.getPositionAtDirection(direction);
                if (nextPos.isNearExit(0) || !nextPos.isNearExit(1)) { break; }
                if (Game.map.getTerrainAt(nextPos) === "wall") { break; }
                Viz.colorPos(nextPos, "yellow", .2);
                slots.push(nextPos);
                lastPos = nextPos;
            }
        }

        return slots;
    }

    private longBowTravel(agent: Agent, destination: {pos: RoomPosition} | RoomPosition,
                          options?: TravelToOptions): number {
        if (!options) {
            options = {};
        }

        options.route = {
            [this.raidData.fallbackFlag.pos.roomName]: true,
        };

        options.maxRooms = 1;
        options.useFindRoute = false;

        return agent.travelTo(destination, options);
    }
}
