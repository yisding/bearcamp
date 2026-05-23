// Test fixtures: sample RIDB API payloads.
//
// These mirror the shape Recreation.gov returns for a Recreation Area
// detail + the nested Activities/Facilities arrays the import script
// flattens before mapping to Campsite/Amenities.
//
// They are deliberately minimal — just enough fields for `amenity-map.ts`
// + `ridb.ts` to exercise the full mapping table:
//
//   - one bear-country, water-available, flush-toilets row (mapped via
//     `bearRegions` because the RIDB payload does not directly carry
//     "bearCountry")
//   - one no-water, vault-toilets, no-electricity row (vault → 'vault';
//     missing attributes default to the conservative branch)
//   - one entry with NO usable attribute records at all → exercises the
//     unknown-defaults path (toilets:'none'; bearCountry derives from
//     state ∈ bearRegions)

export interface RidbAttribute {
  AttributeName: string
  AttributeValue: string
}

export interface RidbCampground {
  // Real RIDB uses "RecAreaID" or "FacilityID" depending on endpoint;
  // we standardize on RecAreaID for the importer's mapper input.
  RecAreaID: string | number
  RecAreaName?: string
  FacilityName?: string
  RecAreaDescription?: string
  FacilityDescription?: string
  RecAreaLatitude?: number
  RecAreaLongitude?: number
  FacilityLatitude?: number
  FacilityLongitude?: number
  // Two-char state code (RIDB returns 2-letter postal codes).
  AddressStateCode?: string
  // Managing agency (NPS, USFS, BLM, USACE, …)
  ParentOrganization?: string
  ATTRIBUTES?: RidbAttribute[]
  ACTIVITY?: Array<{ ActivityName: string }>
}

// 1) Yosemite (CA) — bear country state, full amenities, flush toilets.
export const ridbYosemite: RidbCampground = {
  RecAreaID: '232447',
  RecAreaName: 'Yosemite Pines Campground',
  RecAreaDescription: 'Sierra Nevada campground in bear country.',
  RecAreaLatitude: 37.8651,
  RecAreaLongitude: -119.5383,
  AddressStateCode: 'CA',
  ParentOrganization: 'NPS',
  ATTRIBUTES: [
    { AttributeName: 'Potable Water', AttributeValue: 'Yes' },
    { AttributeName: 'Toilets', AttributeValue: 'Flush' },
    { AttributeName: 'Showers', AttributeValue: 'Yes' },
    { AttributeName: 'Electricity Hookup', AttributeValue: 'Yes' },
    { AttributeName: 'Fire Ring', AttributeValue: 'Yes' },
    { AttributeName: 'Firewood', AttributeValue: 'Yes' },
    { AttributeName: 'Picnic Table', AttributeValue: 'Yes' },
    { AttributeName: 'Bear Locker', AttributeValue: 'Yes' },
    { AttributeName: 'Trash', AttributeValue: 'Yes' },
    { AttributeName: 'Dump Station', AttributeValue: 'Yes' },
    { AttributeName: 'Cell Reception', AttributeValue: 'Good' },
    { AttributeName: 'Site Access', AttributeValue: 'Drive-in' },
  ],
  ACTIVITY: [{ ActivityName: 'Hiking' }, { ActivityName: 'Climbing' }],
}

// 2) Dispersed Utah BLM — no water, vault toilets, no electricity, no bears.
export const ridbUtah: RidbCampground = {
  RecAreaID: 998001,
  RecAreaName: 'Cedar Mesa Dispersed',
  RecAreaDescription: 'Primitive dispersed camping on BLM land.',
  RecAreaLatitude: 37.5,
  RecAreaLongitude: -109.9,
  AddressStateCode: 'UT',
  ParentOrganization: 'BLM',
  ATTRIBUTES: [
    { AttributeName: 'Potable Water', AttributeValue: 'No' },
    { AttributeName: 'Toilets', AttributeValue: 'Vault' },
    { AttributeName: 'Showers', AttributeValue: 'No' },
    { AttributeName: 'Electricity Hookup', AttributeValue: 'No' },
    { AttributeName: 'Fire Ring', AttributeValue: 'No' },
    { AttributeName: 'Cell Reception', AttributeValue: 'None' },
    { AttributeName: 'Site Access', AttributeValue: 'Drive-in' },
  ],
  ACTIVITY: [{ ActivityName: 'Stargazing' }],
}

// 3) No attributes at all — drive the unknown-defaults branch. State is
//    Wyoming (in bearRegions) so the conservative default flips
//    bearCountry → true.
export const ridbUnknownWyoming: RidbCampground = {
  RecAreaID: '777',
  RecAreaName: 'Unknown Wyoming Site',
  AddressStateCode: 'WY',
  ParentOrganization: 'USFS',
}

// 4) Same minimal payload but in Florida (NOT in bearRegions) — same
//    unknown defaults except bearCountry should be `false`.
export const ridbUnknownFlorida: RidbCampground = {
  RecAreaID: '888',
  RecAreaName: 'Unknown Florida Site',
  AddressStateCode: 'FL',
  ParentOrganization: 'Private',
}

export const allSamples = [
  ridbYosemite,
  ridbUtah,
  ridbUnknownWyoming,
  ridbUnknownFlorida,
]
