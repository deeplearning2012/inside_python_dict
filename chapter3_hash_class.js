var React = require('react');

import {HashBreakpointFunction, pyHash} from './hash_impl_common.js';

import {
    HashBoxesComponent, LineOfBoxesComponent, TetrisSingleRowWrap, Tetris,
    SimpleCodeBlock, VisualizedCode
} from './code_blocks.js';

import {JsonInput} from './inputs.js';

let dummyFormat = function(bp) {
    /* return JSON.stringify(bp); */
    return "";
}

class HashClassBreakpointFunction extends HashBreakpointFunction {
    constructor(evals, converters, bpFuncs) {
        super(evals, {
            hashCode: hc => hc !== null ? hc.toString() : null,
            'hashCodes': hcs => hcs.map(hc => hc !== null ? hc.toString() : null),
            ...converters
        }, {
            hashCodes: bp => bp.self.slots.map(s => s.hashCode),
            keys: bp => bp.self.slots.map(s => s.key),
            values: bp => bp.self.slots.map(s => s.value),
            ...bpFuncs
        });
    }
}


function hashClassConstructor() {
    let self = {
        slots: [],
        used: 0,
        fill: 0,
    };

    for (let i = 0; i < 8; ++i) {
        self.slots.push(new Slot());
    }

    return self;
}

class Slot {
    constructor(hashCode=null, key=null, value=null) {
        this.hashCode = hashCode;
        this.key = key;
        this.value = value;
    }
}

function findOptimalSize(used, quot=2) {
    let newSize = 8;
    while (newSize <= quot * used) {
        newSize *= 2;
    }

    return newSize;
}

const HASH_CLASS_SETITEM_CODE = [
    ["def __setitem__(self, key, value):", "start-execution"],
    ["    hash_code = hash(key)", "compute-hash"],
    ["    idx = hash_code % len(self.slots)", "compute-idx"],
    ["    while self.slots[idx].key is not NULL and self.slots[idx].key is not DUMMY:", "check-collision-with-dummy"],
    ["        if self.slots[idx].hash_code == hash_code and\\", "check-dup-hash"],
    ["           self.slots[idx].key == key:", "check-dup-key"],
    ["            break", "check-dup-break"],
    ["        idx = (idx + 1) % len(self.slots)", "next-idx"],
    ["", ""],
    ["    if self.slots[idx].key is NULL or self.slots[idx].key is DUMMY:", "check-used-increased"],
    ["        self.used += 1", "inc-used"],
    ["    if self.slots[idx].key is NULL:", "check-fill-increased"],
    ["        self.fill += 1", "inc-fill"],
    ["", ""],
    ["    self.slots[idx] = Slot(hash_code, key, value)", "assign-slot"],
    ["    if self.fill * 3 >= len(self.slots) * 2:", "check-resize"],
    ["        self.resize()", "resize"],
    ["", "done-no-return"],
];

class HashClassSetItem extends HashClassBreakpointFunction {
    run(_self, _key, _value) {
        this.self = _self;
        this.key = _key;
        this.value = _value;

        this.hashCode = pyHash(this.key);
        this.addBP('compute-hash');

        this.idx = this.computeIdx(this.hashCode, this.self.slots.length);
        this.addBP('compute-idx');

        while (true) {
            this.addBP('check-collision-with-dummy');
            if (this.self.slots[this.idx].key === null || this.self.slots[this.idx].key === "DUMMY") {
                break;
            }

            this.addBP('check-dup-hash');
            if (this.self.slots[this.idx].hashCode.eq(this.hashCode)) {
                this.addBP('check-dup-key');
                if (this.self.slots[this.idx].key == this.key) {
                    this.addBP('check-dup-break');
                    break;
                }
            }

            this.idx = (this.idx + 1) % this.self.slots.length;
            this.addBP('next-idx');
        }

        this.addBP('check-used-increased');
        if (this.self.slots[this.idx].key === null ||
            this.self.slots[this.idx].key === "DUMMY") {
            this.addBP('inc-used');
            this.self.used += 1;
        }

        this.addBP('check-fill-increased');
        if (this.self.slots[this.idx].key === null) {
            this.addBP('inc-fill');
            this.self.fill += 1;
        }

        this.self.slots[this.idx] = new Slot(this.hashCode, this.key, this.value);
        this.addBP('assign-slot');
        this.addBP('check-resize');
        if (this.self.fill * 3 >= this.self.slots.length * 2) {
            let hashClassResize = new HashClassResize();
            this.self = hashClassResize.run(this.self);
            this.addBP('resize');
        }
        this.addBP("done-no-return");
        return this.self;
    }
}


class HashClassInsertAll extends HashBreakpointFunction {
    run(_self, _pairs) {
        this.self = _self;
        this.pairs = _pairs;
        let fromKeys = this.pairs.map(p => p[0]);
        let fromValues = this.pairs.map(p => p[1]);
        for ([this.oldIdx, [this.oldKey, this.oldValue]] of this.pairs.entries()) {
            console.log(this.oldIdx, this.oldKey, this.oldValue);
            let hcsi = new HashClassSetItem();
            hcsi.setExtraBpContext({
                oldIdx: this.oldIdx,
                fromKeys: fromKeys,
                fromValues: fromValues,
            });
            this.self = hcsi.run(this.self, this.oldKey, this.oldValue);
            this._breakpoints = [...this._breakpoints,...hcsi.getBreakpoints()]
            console.log("-----------");
            console.log("THIS._BREAKPOINTS");
            console.log(this._breakpoints);
        }
    }
}

function HashClassInsertAllVisualization(props) {
    return <Tetris
        lines={
            [
                [LineOfBoxesComponent, ["from_keys", "fromKeys", "oldIdx"]],
                [LineOfBoxesComponent, ["from_values", "fromValues", "oldIdx"]],
                [HashBoxesComponent, ["hash_codes", "hashCodes", "idx"]],
                [HashBoxesComponent, ["keys", "keys", "idx"]],
                [HashBoxesComponent, ["values", "values", "idx"]],
            ]
        }
        {...props}
    />;
}


const HASH_CLASS_RESIZE_CODE = [
    ["def resize(self):", "start-execution"],
    ["    old_slots = self.slots", "assign-old-slots"],
    ["    new_size = self.find_optimal_size(quot)", "compute-new-size"],
    ["    self.slots = [Slot() for _ in range(new_size)]", "new-empty-slots"],
    ["    self.fill = self.used", "assign-fill"],
    ["    for slot in old_slots:", "for-loop"],
    ["        if slot.key is not EMPTY and slot.key is not DUMMY:", "check-skip-empty-dummy"],
    ["              hash_code = hash(slot.key)", "compute-hash"],
    ["              idx = hash_code % len(self.slots)", "compute-idx"],
    ["              while self.slots[idx].key is not NULL:", "check-collision"],
    ["                  idx = (idx + 1) % len(self.slots)", "next-idx"],
    ["", ""],
    ["              self.slots[idx] = Slot(hash_code, slot.key, slot.value)", "assign-slot"],
    ["", "done-no-return"],
];

class HashClassResize extends HashBreakpointFunction {
    constructor() {
        super(null, {
            'hashCode': hc => hc !== null ? hc.toString() : null,
            'hashCodes': hcs => hcs.map(hc => hc !== null ? hc.toString() : null),
        });
    }

    run(_self) {
        this.self = _self;

        this.oldSlots = this.self.slots;
        this.addBP("assign-old-slots");
        this.newSize = findOptimalSize(this.self.used);
        this.addBP("compute-new-size");

        this.self.slots = [];

        for (let i = 0; i < this.newSize; ++i) {
            this.self.slots.push(new Slot());
        }
        this.addBP("new-empty-slots");

        this.self.fill = this.self.used;
        this.addBP("assign-fill");

        for ([this.oldIdx, this.slot] of this.oldSlots.entries()) {
            this.addBP('for-loop');
            this.addBP('check-skip-empty-dummy');
            if (this.slot.key === null || this.slot.key === "DUMMY") {
                this.addBP('continue');
                continue;
            }
            this.idx = this.computeIdx(this.slot.hashCode, this.self.slots.length);
            this.addBP('compute-idx');

            while (true) {
                this.addBP('check-collision');
                if (this.self.slots[this.idx].key === null) {
                    break;
                }

                this.idx = (this.idx + 1) % this.self.slots.length;
                this.addBP('next-idx');
            }

            this.self.slots[this.idx] = new Slot(this.slot.hashCode, this.slot.key, this.slot.value);
            this.addBP('assign-slot');
        }
        this.oldIdx = null;
        this.idx = null;
        this.addBP('done-no-return');

        return this.self;
    }
};


class Chapter3_HashClass extends React.Component {
    constructor() {
        super();

        this.state = {
            exampleArray: ["abde","cdef","world","hmmm","hello","xxx","ya","hello,world!","well","meh"],
            hashClassOriginalPairs: [["abde", 1], ["cdef", 4], ["world", 9], ["hmmm", 16], ["hello", 25], ["xxx", 36], ["ya", 49], ["hello,world!", 64], ["well", 81], ["meh", 100]],
        }
    }

    render() {
        let hashClassSelf = hashClassConstructor();
        let hashClassInsertAll = new HashClassInsertAll();
        hashClassInsertAll.run(hashClassSelf, this.state.hashClassOriginalPairs);
        let hashClassInsertAllBreakpoints = hashClassInsertAll.getBreakpoints();

        return <div className="chapter3">
              <h2> Chapter 3. Putting it all together to make an almost-python-dict</h2>
              <p> We now have all the building blocks available that allow us to make <em>something like a python dict</em>. In this section, we'll make functions track <code>fill</code> and <code>used</code> values, so we know when a table gets overflown. And we will also handle values (in addition to keys). And we will make a class that supports all basic operations from <code>dict</code>. On the inside this class would work differently from actual python dict. In the following chapter we will turn this code into python 3.2's version of dict by making changes to the probing algorithm. </p>
              <p> This section assumes you have a basic understanding of how classes work in python and magic methods. Classes are going to be used to bundle data and functions together. And magic methods will be used for things like __getitem__ which allows us to implement [] for our own classes. Magic methods are special methods for "overloading" operators. So we can write our_dict[key] instead of writing our_dict.__getitem__(key) or our_dict.find(key). The <code>[]</code> looks nicer and allows us to mimic some parts of the interface of python dict. </p>
              <p> To handle values we'd need yet another list (in addition to <code>hash_codes</code> and <code>keys</code>. Using another list would totally work. But let's actually bundle <code>hash_code</code>, <code>key</code>, <code>value</code> corresponding to each slot in a single class: </p>
              <SimpleCodeBlock>
{`class Slot(object):
    def __init__(self, hash_code=EMPTY, key=EMPTY, value=EMPTY):
        self.hash_code = hash_code
        self.key = key
        self.value = value
`}
			  </SimpleCodeBlock>

              <p> Now, for our hash table we will use a class, and for each operation we will have a magic method. How do we initialize an empty hash table? We used to base the size on the original list. Now we know how to resize hash tables, so we can start from an empty table. The number shouldn't be too small and too big. Let's start with 8 (since that's what python does). Python hash table sizes are power of 2, so we will use power of 2 too. Technically, nothing prevents using "non-round" values. The only reason for using "round" powers of 2 is efficiency. Getting modulo by power of 2 can be implemented efficiently using bit operations. We will keep using modulo instead of bit ops for expressiveness. </p>
              <p> Here is how our class is going to look like: </p>
              <SimpleCodeBlock>
{`class AlmostDict(object):
    def __init__(self):
        self.slots = [Slot() for _ in range(8)]
        self.fill = 0
        self.used = 0

    def __setitem__(self, key, value):
        # Allows us set value in a dict-like fashion
        # d = Dict()
        # d[1] = 2
        <implementation here>

    def __getitem__(self, key):
        # Allows us to get value from a ict, for example:
        # d = Dict()
        # d[1] = 2
        # d[1] == 2
        <implementation here>

    def __delitem__(self, key):
        # Allows us to use del in a dict-like fashion, for example:
        # d = Dict()
        # d[1] = 2
        # del d[1]
        # d[1] raises KeyError now
        <implementation here>
`}
			  </SimpleCodeBlock>
              <p> Each method is going to update <code>self.fill</code> and <code>self.used</code>, so the fill factor is tracked correctly. </p>
              <p> When resizing a hash table, how do we find a new optimal size? There is no definitive answer. The size is increased by a power of 2, because we want to keep the size a power of 2. </p>
              <SimpleCodeBlock>
{`def find_optimal_size(self):
    new_size = 8
    while new_size <= 2 * self.used:
        new_size *= 2

    return new_size
`}
              </SimpleCodeBlock>
              <p> This code only uses <code>self.used</code>. It does not depend on <code>self.fill</code> in any way. This means that the table could potentially shrink if most slots are filled with dummy elements. </p>
              TODO: nice component displaying the relationship between fill/used ?

              <p> Let's say we want create a dict from the following pairs: </p>
              <JsonInput value={this.state.hashClassOriginalPairs} onChange={(value) => this.setState({hashClassOriginalPairs: value})} />

              <VisualizedCode
                code={HASH_CLASS_SETITEM_CODE}
                breakpoints={hashClassInsertAllBreakpoints}
                formatBpDesc={dummyFormat}
                stateVisualization={HashClassInsertAllVisualization} />
        </div>
    }
}

export {
    Chapter3_HashClass
}