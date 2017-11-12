import {SpawnGroup} from "./SpawnGroup";
import {Diplomat} from "./Diplomat";
import {WorldMap} from "./WorldMap";
import {TradeNetwork} from "./TradeNetwork";
import {MarketTrader} from "./MarketTrader";
import {Janitor} from "./Janitor";
import {Archiver} from "./Archiver";
import {Notifier} from "../notifier";
import {Scheduler} from "../Scheduler";
import {AbstractAgent} from "./agents/AbstractAgent";
import {MatrixHelper} from "../helpers/MatrixHelper";
import {SignMaker} from "./SignMaker";
import {Profiler} from "../Profiler";
import {PosHelper} from "../helpers/PosHelper";
import {Observationer} from "./Observationer";
import {RoomPlanter} from "./RoomPlanter";
import {AutoNuker} from "./AutoNuker";

export class Empire {

    public spawnGroups: {[roomName: string]: SpawnGroup};
    public diplomat: Diplomat;
    public map: WorldMap;
    public network: TradeNetwork;
    public market: MarketTrader;
    public janitor: Janitor;
    private updateTick: number;

    public static get(): Empire {
        global.root = empire;
        return empire;
    }

    /**
     * Occurs in init
     */

    public init() {
        this.initMemory();
        this.diplomat = new Diplomat();
        this.map = new WorldMap(this.diplomat);
        this.spawnGroups = this.map.init();
        this.network = new TradeNetwork(this.map, this.diplomat);
        this.market = new MarketTrader(this.network);

        let blacklist: {[roomName: string]: boolean } = {};
        for (let roomName in this.map.foesMap) {
            blacklist[roomName] = true;
        }
        this.market.updateBlacklist(blacklist);

        this.janitor = new Janitor();
        this.janitor.init();
        SpawnGroup.init(this.spawnGroups);
        Archiver.init();
        SignMaker.init();
        Observationer.init();
        AutoNuker.init();
    }

    /**
     * Occurs during tick, before operation phases
     */

    public update(forceUpdate = false) {

        if (!forceUpdate && this.updateTick === Game.time) { return; }
        this.updateTick = Game.time;

        this.diplomat.update();
        this.map.update();
        this.network.update();
        this.market.update();
        this.janitor.update();
        Notifier.update();
        SpawnGroup.update(this.spawnGroups);
        Archiver.update();
        Scheduler.update();
        AbstractAgent.update();
        MatrixHelper.update();
        RoomPlanter.update();
    }

    /**
     * Occurs after operation phases
     */

    public finalize() {
        this.map.actions();
        this.network.actions();
        this.market.actions();
        this.janitor.actions();
        Observationer.actions();
        SignMaker.actions();
        AutoNuker.actions();

        SpawnGroup.finalize(this.spawnGroups);
        Archiver.finalize();
    }

    public underCPULimit(limit = .9) {
        return Profiler.proportionUsed() < limit;
    }

    public cpuAvailable(amount: number) {
        return Profiler.marginUnused() > amount;
    }

    public getSpawnGroup(roomName: string) {
        return this.spawnGroups[roomName];
    }

    public spawnFromClosest(targetRoomName: string, body: string[], name: string, forceSpawn = false) {
        let closest: SpawnGroup;
        let bestDistance = Number.MAX_VALUE;
        for (let roomName in this.spawnGroups) {
            let distance = Game.map.getRoomLinearDistance(targetRoomName, roomName);
            if (distance < bestDistance) {
                bestDistance = distance;
                closest = this.spawnGroups[roomName];
            }
        }
        if (closest && (closest.isAvailable || forceSpawn)) {
            return closest.spawn(body, name);
        }
    }

    public initMemory() {
        _.defaultsDeep(Memory, {
            stats: {},
            temp: {},
            playerConfig: {
                terminalNetworkRange: 6,
                muteSpawn: false,
                enableStats: false,
                creditReserveAmount: Number.MAX_VALUE,
                powerMinimum: 9000,
            },
            profiler: {},
            traders: {},
            powerObservers: {},
            notifier: [],
            cpu: {
                history: [],
                average: Game.cpu.getUsed(),
            },
            hostileMemory: {},
            empire: {},
            freelance: {},
            marketTrader: {},
        });
    }

    public addOperation(type: string, position?: RoomPosition, opName?: string, overwrite = true) {
        let room = Game.rooms[position.roomName];
        if (!room) {
            Notifier.log(`EMPIRE: cannot place operation, no visibility in ${position.roomName}`, 5);
            return;
        }

        if (!opName) {
            opName = this.generateName(type, position.roomName);
        }
        let flagName = `${type}_${opName}`;
        if (overwrite && Memory.flags) {
            delete Memory.flags[flagName];
        }
        Notifier.log(`EMPIRE: created new operation in ${room.name}: ${flagName}`, 1);
        position.createFlag(`${flagName}`, COLOR_CYAN, COLOR_GREY);
    }

    private generateName(opType: string, roomName: string) {
        return roomName + opType[0];
    }
}

export let empire: Empire = new Empire();
global["empire"] = empire;
