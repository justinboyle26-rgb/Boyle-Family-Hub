/* Room templates and the starter house for 25 Basildon Dr. Costs are national planning allowances. */
(function (global) {
  var RATE = {
    labor: 55, carpenter: 85, electrician: 115, plumber: 125, hvac: 120,
    tile: 90, painter: 60, flooring: 70, cabinet: 80, drywall: 60, roofer: 85
  };
  var TIER = { good: 0.75, better: 1, best: 1.65 };

  function cost(item, house) {
    house = house || {};
    var tier = TIER[house.quality] || 1;
    var region = Number(house.region) || 1;
    var markup = (Number(house.markup) || 0) / 100;
    var qty = Number(item.qty) || 0;
    var waste = Number(item.waste) || 0;
    var materials = qty * (1 + waste) * (Number(item.mat) || 0) * tier * region;
    var tradeRate = RATE[item.trade] || 55;
    if (house.rates && Number(house.rates[item.trade]) > 0) tradeRate = Number(house.rates[item.trade]);
    var proHours = qty * (Number(item.hours) || 0);
    var labor = proHours * tradeRate * region;
    var hire = (item.supply === 'owner' ? materials : materials * (1 + markup)) + labor;
    var diyHours = proHours * (Number(item.diyMult) || 2.2);
    var diy = materials + (house.countTime ? diyHours * (Number(house.timeRate) || 0) : 0);
    var who = item.who || 'later';
    var plan = who === 'skip' ? 0 : who === 'diy' ? diy : hire;
    return { materials: materials, labor: labor, hire: hire, diy: diy, diyHours: diyHours, proHours: proHours, plan: plan };
  }

  function rollup(data) {
    var house = (data && data.house) || {};
    var items = data && data.items ? data.items : {};
    var expenses = data && data.expenses ? data.expenses : {};
    var plan = 0, hire = 0, diy = 0, hours = 0;
    var byRoom = {}, byCat = {};
    Object.keys(items).forEach(function (id) {
      var item = items[id];
      var c = cost(item, house);
      plan += c.plan; hire += c.hire; diy += c.diy;
      if (item.who === 'diy') hours += c.diyHours;
      var room = byRoom[item.roomId] || (byRoom[item.roomId] = { plan: 0, hire: 0, diy: 0, hours: 0, count: 0 });
      room.plan += c.plan; room.hire += c.hire; room.diy += c.diy; room.count += 1;
      if (item.who === 'diy') room.hours += c.diyHours;
      var cat = byCat[item.cat || 'Other'] || (byCat[item.cat || 'Other'] = { plan: 0, hire: 0 });
      cat.plan += c.plan; cat.hire += c.hire;
    });
    var spent = {}, spentAll = 0;
    Object.keys(expenses).forEach(function (id) {
      var n = Number(expenses[id].amount) || 0;
      spentAll += n;
      var key = expenses[id].roomId || '';
      spent[key] = (spent[key] || 0) + n;
    });
    var pct = Number(house.contingency) || 0;
    return {
      plan: plan, hire: hire, diy: diy, hours: hours, byRoom: byRoom, byCat: byCat,
      spent: spent, spentAll: spentAll, contingency: plan * pct / 100, withCont: plan * (1 + pct / 100)
    };
  }

  function perimeter(room) {
    var s = Number(room.sqft) || 0;
    return Math.max(12, Math.round(4 * Math.sqrt(s || 1)));
  }

  function line(partial) {
    return Object.assign({
      qty: 1, unit: 'each', mat: 0, hours: 0, waste: 0, trade: 'labor',
      supply: 'trade', who: 'later', diyMult: 2.2, cat: 'Other', notes: ''
    }, partial);
  }

  function paintLine(room, who) {
    var s = Number(room.sqft) || 0;
    return line({
      name: 'Paint walls and ceiling', cat: 'Finishes', qty: 1, unit: 'room',
      mat: Math.max(40, Math.round(s * 0.55)), hours: Math.max(4, Math.round(s / 30)),
      trade: 'painter', who: who || 'diy', notes: 'Material figure is for the whole room.'
    });
  }

  function floorLine(room, who) {
    return line({
      name: 'Luxury vinyl floor', cat: 'Finishes', qty: Number(room.sqft) || 0, unit: 'sq ft',
      mat: 4.5, hours: 0.03, waste: 0.1, trade: 'flooring', who: who || 'later'
    });
  }

  var templates = {
    kitchen: function (room) {
      var s = Number(room.sqft) || 200;
      var base = Math.max(12, Math.round(s / 16));
      var wall = Math.max(8, Math.round(base * 0.75));
      var island = s >= 180 ? Math.max(6, Math.round(s / 40)) : 0;
      var quartz = Math.round(base * 2.1 + island * 3.2);
      var rows = [
        line({ name: 'Dumpster and haul-off', cat: 'Demo', qty: 1, unit: 'each', mat: 650, hours: 2, supply: 'owner', who: 'diy' }),
        line({ name: 'Remove cabinets', cat: 'Demo', qty: base + wall + island, unit: 'lf', hours: 0.3, who: 'diy' }),
        line({ name: 'Remove flooring', cat: 'Demo', qty: s, unit: 'sq ft', mat: 0.1, hours: 0.02, who: 'diy' }),
        line({ name: 'Base cabinets', cat: 'Cabinets', qty: base, unit: 'lf', mat: 450, hours: 0.5, trade: 'cabinet', who: 'diy', notes: 'Better semi-custom, boxes and doors.' }),
        line({ name: 'Wall cabinets', cat: 'Cabinets', qty: wall, unit: 'lf', mat: 280, hours: 0.35, trade: 'cabinet', who: 'diy' })
      ];
      if (island) rows.push(line({ name: 'Island cabinets', cat: 'Cabinets', qty: island, unit: 'lf', mat: 500, hours: 0.55, trade: 'cabinet', who: 'diy' }));
      rows.push(
        line({ name: 'Quartz counters', cat: 'Finishes', qty: quartz, unit: 'sq ft', mat: 78, hours: 0.08, waste: 0.05, trade: 'cabinet', who: 'hire', notes: 'Shop fabricates and installs.' }),
        line({ name: 'Tile backsplash', cat: 'Finishes', qty: Math.max(28, Math.round(s * 0.15)), unit: 'sq ft', mat: 18, hours: 0.15, waste: 0.12, trade: 'tile', who: 'diy' }),
        floorLine(room, 'diy'),
        paintLine(room, 'diy'),
        line({ name: 'Recessed lights', cat: 'Electrical', qty: Math.max(6, Math.round(s / 35)), unit: 'each', mat: 35, hours: 0.5, trade: 'electrician', who: 'hire', notes: 'Licensed trade.' }),
        line({ name: 'Dedicated appliance circuits', cat: 'Electrical', qty: 4, unit: 'each', mat: 85, hours: 1.8, trade: 'electrician', who: 'hire', notes: 'Licensed trade.' }),
        line({ name: 'GFCI outlets', cat: 'Electrical', qty: 6, unit: 'each', mat: 28, hours: 0.45, trade: 'electrician', who: 'hire', notes: 'Licensed trade.' }),
        line({ name: 'Under-cabinet lighting', cat: 'Electrical', qty: wall, unit: 'lf', mat: 28, hours: 0.15, trade: 'electrician', supply: 'owner', who: 'diy' }),
        line({ name: 'Sink, faucet, and disposal', cat: 'Plumbing', qty: 1, unit: 'set', mat: 780, hours: 3.5, trade: 'plumber', supply: 'owner', who: 'diy' }),
        line({ name: 'Dishwasher hookup', cat: 'Plumbing', qty: 1, unit: 'each', mat: 45, hours: 1.2, trade: 'plumber', who: 'hire', notes: 'Licensed trade.' }),
        line({ name: 'Appliance package', cat: 'Appliances', qty: 1, unit: 'allowance', mat: 5900, hours: 4, supply: 'owner', who: 'diy', notes: 'Fridge, range, dishwasher, microwave, and hood. You buy them.' })
      );
      return rows;
    },
    bath: function (room) {
      var s = Number(room.sqft) || 70;
      var walls = Math.max(70, Math.round(s * 1.1));
      return [
        line({ name: 'Bath demo and haul-off', cat: 'Demo', qty: 1, unit: 'room', mat: 180, hours: 6, who: 'diy' }),
        line({ name: 'Shower waterproofing and tile', cat: 'Finishes', qty: walls, unit: 'sq ft', mat: 16, hours: 0.18, waste: 0.12, trade: 'tile', who: 'hire' }),
        line({ name: 'Shower valve and trim', cat: 'Plumbing', qty: 1, unit: 'each', mat: 220, hours: 4, trade: 'plumber', who: 'hire', notes: 'Licensed trade.' }),
        line({ name: 'Shower glass', cat: 'Finishes', qty: 1, unit: 'each', mat: 900, hours: 2, who: 'hire' }),
        line({ name: 'Floor tile', cat: 'Finishes', qty: s, unit: 'sq ft', mat: 8, hours: 0.08, waste: 0.12, trade: 'tile', who: 'later' }),
        line({ name: 'Vanity and top', cat: 'Fixtures', qty: 1, unit: 'each', mat: 1400, hours: 2.5, trade: 'carpenter', supply: 'owner', who: 'later' }),
        line({ name: 'Toilet', cat: 'Fixtures', qty: 1, unit: 'each', mat: 280, hours: 1.5, trade: 'plumber', supply: 'owner', who: 'hire' }),
        line({ name: 'Exhaust fan', cat: 'Electrical', qty: 1, unit: 'each', mat: 140, hours: 1.5, trade: 'electrician', who: 'hire', notes: 'Licensed trade.' }),
        line({ name: 'Vanity light', cat: 'Electrical', qty: 1, unit: 'each', mat: 180, hours: 0.8, trade: 'electrician', supply: 'owner', who: 'hire' }),
        paintLine(room, 'diy')
      ];
    },
    halfbath: function (room) {
      var s = Number(room.sqft) || 30;
      return [
        line({ name: 'Vanity, top, and faucet', cat: 'Fixtures', qty: 1, unit: 'each', mat: 650, hours: 2, trade: 'carpenter', supply: 'owner', who: 'later' }),
        line({ name: 'Toilet', cat: 'Fixtures', qty: 1, unit: 'each', mat: 280, hours: 1.5, trade: 'plumber', supply: 'owner', who: 'hire' }),
        line({ name: 'Floor tile', cat: 'Finishes', qty: s, unit: 'sq ft', mat: 8, hours: 0.08, waste: 0.12, trade: 'tile', who: 'diy' }),
        line({ name: 'Light', cat: 'Electrical', qty: 1, unit: 'each', mat: 90, hours: 0.6, trade: 'electrician', supply: 'owner', who: 'hire' }),
        paintLine(room, 'diy')
      ];
    },
    bedroom: function (room) {
      return [
        floorLine(room, 'later'),
        paintLine(room, 'diy'),
        line({ name: 'Baseboard', cat: 'Finishes', qty: perimeter(room), unit: 'lf', mat: 3.25, hours: 0.04, waste: 0.1, trade: 'carpenter', who: 'diy' }),
        line({ name: 'Ceiling fan', cat: 'Electrical', qty: 1, unit: 'each', mat: 180, hours: 1.2, trade: 'electrician', supply: 'owner', who: 'hire', notes: 'Licensed trade if a new box or circuit is required.' })
      ];
    },
    closet: function (room) {
      return [
        line({ name: 'Closet system', cat: 'Fixtures', qty: 1, unit: 'each', mat: 800, hours: 3, trade: 'carpenter', who: 'later' }),
        floorLine(room, 'diy'),
        paintLine(room, 'diy')
      ];
    },
    living: function (room) {
      return [
        floorLine(room, 'later'),
        paintLine(room, 'diy'),
        line({ name: 'Baseboard', cat: 'Finishes', qty: perimeter(room), unit: 'lf', mat: 3.25, hours: 0.04, waste: 0.1, trade: 'carpenter', who: 'diy' }),
        line({ name: 'Recessed lights', cat: 'Electrical', qty: Math.max(2, Math.round((Number(room.sqft) || 0) / 50)), unit: 'each', mat: 35, hours: 0.5, trade: 'electrician', who: 'hire', notes: 'Licensed trade.' })
      ];
    },
    laundry: function (room) {
      return [
        floorLine(room, 'diy'),
        paintLine(room, 'diy'),
        line({ name: 'Washer and dryer hookups', cat: 'Plumbing', qty: 1, unit: 'set', mat: 80, hours: 2, trade: 'plumber', who: 'hire', notes: 'Licensed trade if the drains or vents move.' })
      ];
    },
    garage: function (room) {
      var s = Number(room.sqft) || 660;
      return [
        line({ name: 'Garage door', cat: 'Exterior', qty: 1, unit: 'each', mat: 1400, hours: 4, who: 'hire', notes: 'One door. Add a line for each extra bay. Records say 3–4 cars.' }),
        line({ name: 'Opener', cat: 'Exterior', qty: 1, unit: 'each', mat: 280, hours: 1.5, supply: 'owner', who: 'later' }),
        line({ name: 'Floor coating', cat: 'Finishes', qty: s, unit: 'sq ft', mat: 3.5, hours: 0.015, trade: 'painter', who: 'diy' })
      ];
    },
    exterior: function () {
      return [
        line({ name: 'Exterior paint', cat: 'Exterior', qty: 1, unit: 'allowance', mat: 2500, hours: 40, trade: 'painter', who: 'later', notes: 'Whole-house allowance. Replace it with a bid.' }),
        line({ name: 'Window package', cat: 'Exterior', qty: 1, unit: 'allowance', mat: 8000, hours: 16, trade: 'carpenter', who: 'later', notes: 'Allowance until you count the windows.' })
      ];
    },
    deck: function (room) {
      var s = Number(room.sqft) || 200;
      return [
        line({ name: 'Deck surface and framing', cat: 'Exterior', qty: s, unit: 'sq ft', mat: 18, hours: 0.12, waste: 0.1, trade: 'carpenter', who: 'later', notes: 'Set the square feet to the deck you actually want.' })
      ];
    },
    systems: function () {
      return [
        line({ name: 'Heat pump replacement', cat: 'Systems', qty: 1, unit: 'allowance', mat: 6500, hours: 16, trade: 'hvac', who: 'hire', notes: 'Built in 1991. Replace this allowance with a bid.' }),
        line({ name: 'Water heater', cat: 'Systems', qty: 1, unit: 'each', mat: 900, hours: 3, trade: 'plumber', who: 'hire', notes: '50-gallon electric allowance.' }),
        line({ name: 'Roof replacement', cat: 'Systems', qty: 1, unit: 'allowance', mat: 12000, hours: 30, trade: 'roofer', who: 'later', notes: 'Budgeted until you know the roof age. Skip it if the roof is newer.' }),
        line({ name: 'Electrical panel', cat: 'Systems', qty: 1, unit: 'allowance', mat: 1800, hours: 16, trade: 'electrician', who: 'later', notes: 'Have it looked at before adding kitchen circuits.' })
      ];
    }
  };

  function templateLines(room) {
    var fn = templates[room && room.template];
    return fn ? fn(room) : [];
  }

  function room(id, partial) {
    return Object.assign({
      id: id, floor: 'Main', sqft: 0, status: 'idea', phaseId: '', template: '',
      counts: true, notes: '', order: 0
    }, partial, { id: id });
  }

  function seed() {
    var phases = {
      ph_live: { id: 'ph_live', name: 'Kitchen and living', year: 'Year 1', order: 1, notes: 'The rooms you use every day.' },
      ph_primary: { id: 'ph_primary', name: 'Primary suite', year: 'Year 2', order: 2, notes: '' },
      ph_beds: { id: 'ph_beds', name: 'Bedrooms and other baths', year: 'Year 3', order: 3, notes: '' },
      ph_lower: { id: 'ph_lower', name: 'Lower level and outside', year: 'Year 4', order: 4, notes: '' },
      ph_systems: { id: 'ph_systems', name: 'Systems', year: 'When it is due', order: 5, notes: '1991 equipment. Do these when they fail, or before a room that needs new circuits.' }
    };
    var specs = [
      ['kitchen', 'Kitchen', 'Main', 240, 'kitchen', 'ph_live', 10, 'planning'],
      ['pantry', 'Pantry', 'Main', 40, '', 'ph_live', 20],
      ['dining', 'Dining', 'Main', 180, 'living', 'ph_live', 30],
      ['living', 'Living room', 'Main', 360, 'living', 'ph_live', 40],
      ['family', 'Family room', 'Main', 320, 'living', 'ph_live', 50],
      ['laundry', 'Laundry', 'Main', 80, 'laundry', 'ph_beds', 60],
      ['entry', 'Entry', 'Main', 100, 'living', 'ph_live', 70],
      ['mud', 'Mudroom', 'Main', 70, 'living', 'ph_live', 80],
      ['powder', 'Powder room', 'Main', 30, 'halfbath', 'ph_beds', 90],
      ['office', 'Office', 'Main', 200, 'living', 'ph_beds', 100],
      ['hallm', 'Main hall', 'Main', 130, 'living', 'ph_live', 110],
      ['primary', 'Primary bedroom', 'Upper', 260, 'bedroom', 'ph_primary', 200],
      ['pbath', 'Primary bath', 'Upper', 120, 'bath', 'ph_primary', 210],
      ['closet', 'Primary closet', 'Upper', 80, 'closet', 'ph_primary', 220],
      ['bed2', 'Bedroom 2', 'Upper', 170, 'bedroom', 'ph_beds', 230],
      ['bed3', 'Bedroom 3', 'Upper', 160, 'bedroom', 'ph_beds', 240],
      ['hbath', 'Hall bath', 'Upper', 70, 'bath', 'ph_beds', 250],
      ['hallu', 'Upper hall', 'Upper', 80, 'living', 'ph_beds', 260],
      ['rec', 'Recreation room', 'Lower', 470, 'living', 'ph_lower', 300],
      ['den', 'Den', 'Lower', 220, 'living', 'ph_lower', 310],
      ['bath3', 'Lower bath', 'Lower', 80, 'bath', 'ph_lower', 320],
      ['bath4', 'Bath 4', 'Lower', 70, 'bath', 'ph_lower', 330],
      ['mech', 'Mechanical', 'Lower', 160, '', 'ph_systems', 340],
      ['halll', 'Lower hall', 'Lower', 80, 'living', 'ph_lower', 350],
      ['bonus', 'Bonus room', 'Lower', 280, 'living', 'ph_lower', 360],
      ['store', 'Storage', 'Lower', 250, '', 'ph_lower', 370],
      ['garage', 'Garage', 'Outside', 660, 'garage', 'ph_lower', 400, 'idea', false],
      ['exterior', 'Exterior and windows', 'Outside', 0, 'exterior', 'ph_lower', 410, 'idea', false],
      ['deck', 'Deck or patio', 'Outside', 200, 'deck', 'ph_lower', 420, 'idea', false],
      ['systems', 'Whole-house systems', 'Outside', 0, 'systems', 'ph_systems', 430, 'planning', false]
    ];
    var rooms = {};
    specs.forEach(function (s) {
      rooms[s[0]] = room(s[0], {
        name: s[1], floor: s[2], sqft: s[3], template: s[4], phaseId: s[5],
        order: s[6], status: s[7] || 'idea', counts: s[8] !== false,
        notes: s[0] === 'garage' ? 'Public records describe a 3–4 car garage. The 660 sq ft is a 3-bay placeholder and is not part of the 4,300.' : ''
      });
    });
    var items = {};
    ['kitchen', 'systems'].forEach(function (id) {
      templateLines(rooms[id]).forEach(function (row, i) {
        var itemId = id + '_' + i;
        items[itemId] = Object.assign({ id: itemId, roomId: id, status: 'planned' }, row);
      });
    });
    return {
      house: {
        name: '25 Basildon',
        address: '25 Basildon Dr, Bella Vista, AR 72715',
        sqft: 4300,
        yearBuilt: 1991,
        stories: 2,
        beds: 3,
        baths: 5,
        lot: '0.36 acre',
        garage: '3–4 car',
        people: ['Justin', ''],
        quality: 'better',
        region: 1,
        contingency: 15,
        markup: 20,
        countTime: false,
        timeRate: 35,
        rates: Object.assign({}, RATE),
        zestimate: 607500,
        zestimateDate: '2026-11-02',
        note: 'Zillow lists 4,300 sq ft, 3 bedrooms, and 5 baths, built in 1991, on 0.36 acres. The Zestimate was $607,500 ($141 per sq ft) on Nov 2, 2026. Other indexes say 4.5 baths. Room sizes are a starter so the living area adds up to 4,300. Measure before you trust a quantity.'
      },
      phases: phases,
      rooms: rooms,
      items: items,
      contractors: {},
      bids: {},
      selections: {},
      decisions: {},
      punch: {},
      expenses: {},
      ideas: {},
      schedule: {}
    };
  }

  global.RemodelLib = {
    RATE: RATE,
    cost: cost,
    rollup: rollup,
    templateLines: templateLines,
    seed: seed
  };
})(window);
