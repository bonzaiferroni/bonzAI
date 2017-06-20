export class Archiver {

    private static lastUpdated: {[segmentId: number]: number } = {};
    private static segments: {[segmentId: number]: {[propertyName: string]: any } } = {};
    private static writeSegments: {[segmentId: number]: boolean };

    private static memory: {
        activeSegments: {[segmentId: number]: any };
        lastUpdated: {[segmentId: number]: number };
    };

    public static init() {
        if (!Memory.archiver) { Memory.archiver = {}; }
        this.memory = Memory.archiver;
        if (!this.memory.activeSegments) { this.memory.activeSegments = {}; }
        if (!this.memory.lastUpdated) { this.memory.lastUpdated = {}; }
    }

    // call this at beginning of tick
    public static update() {
        this.memory = Memory.archiver;
        this.writeSegments = {};
    }

    public static getSegment(segmentId: number): {[propertyName: string]: any } {
        if (this.lastUpdated[segmentId] && this.memory.lastUpdated[segmentId] === this.lastUpdated[segmentId]) {
            return this.segments[segmentId];
        }

        let str = RawMemory.segments[segmentId];
        let segment = {};
        try {
            segment = JSON.parse(str);
        } catch (e) {
            console.log(`ARCHIVER: invalid json or first time use of segmentID ${segmentId}, creating new object`);
        }

        this.segments[segmentId] = segment;
        this.lastUpdated[segmentId] = this.memory.lastUpdated[segmentId];
        return segment;
    }

    public static getSegmentProperty<T>(segmentId: number, propertyName: string): T {
        let segment = this.getSegment(segmentId);
        return segment[propertyName];
    }

    public static setSegmentProperty(segmentId: number, propertyName: string, value: any) {
        let segment = this.getSegment(segmentId);
        segment[propertyName] = value;
        this.writeSegments[segmentId] = true;
    }

    // call this at end of tick
    public static finalize() {
        for (let segmentId in this.writeSegments) {
            let str = JSON.stringify(this.segments[segmentId]);
            RawMemory.segments[segmentId] = str;
            this.memory.lastUpdated[segmentId] = Game.time;
        }
    }
}

global.archiver = Archiver;
