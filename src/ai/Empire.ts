import {SpawnGroup} from "./SpawnGroup";
import {Profiler} from "../Profiler";
import {Traveler, traveler} from "./Traveler";
import {WorldMap} from "./WorldMap";
import {MarketTrader} from "./MarketTrader";
import {BonzaiDiplomat} from "./BonzaiDiplomat";
import {BonzaiNetwork} from "./BonzaiNetwork";
import {Scheduler} from "../Scheduler";
import {Archiver} from "./Archiver";
import {MemHelper} from "../helpers/MemHelper";
import {Notifier} from "../notifier";
import {Janitor} from "./Janitor";

export class Empire {

    public spawnGroups: {[roomName: string]: SpawnGroup};
    public traveler: Traveler;
    public diplomat: BonzaiDiplomat;
    public map: WorldMap;
    public network: BonzaiNetwork;
    public market: MarketTrader;
    public archiver: Archiver;
    public janitor: Janitor;

    public static init(): Empire {
        empire.init();
        global.root = empire;
        return empire;
    }

    /**
     * Occurs in init
     */

    public init() {
        this.initMemory();
        this.traveler = traveler;
        this.diplomat = new BonzaiDiplomat();
        this.map = new WorldMap(this.diplomat);
        this.spawnGroups = this.map.init();
        this.network = new BonzaiNetwork(this.map, this.diplomat);
        this.market = new MarketTrader(this.network);
        this.archiver = new Archiver();
        this.archiver.init();
        this.janitor = new Janitor();
        this.janitor.init();
        SpawnGroup.init(this.spawnGroups);
    }

    /**
     * Occurs during tick, before operation phases
     */

    public refresh() {
        this.map.refresh();
        this.network.refresh();
        this.archiver.refresh();
        SpawnGroup.refresh(this.spawnGroups);
    }

    /**
     * Occurs after operation phases
     */

    public actions() {
        this.map.actions();
        this.network.actions();
        this.market.actions();
        this.archiver.finalize();
        SpawnGroup.finalize(this.spawnGroups);
    }

    public underCPULimit() {
        return Profiler.proportionUsed() < .8;
    }

    public getSpawnGroup(roomName: string) {
        return this.spawnGroups[roomName];
    }

    public spawnFromClosest(pos: RoomPosition, body: string[], name: string) {
        let closest: SpawnGroup;
        let bestDistance = Number.MAX_VALUE;
        for (let roomName in this.spawnGroups) {
            let distance = Game.map.getRoomLinearDistance(pos.roomName, roomName);
            if (distance < bestDistance) {
                bestDistance = distance;
                closest = this.spawnGroups[roomName];
            }
        }
        return closest.spawn(body, name);
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
        });
    }
}

export let empire: Empire = new Empire();
