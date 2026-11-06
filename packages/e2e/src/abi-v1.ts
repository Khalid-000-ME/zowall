/** The slice of ZowallGate this runner calls. */

export const GATE_ABI = [
  {
    type: "function",
    name: "createPO",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "po",
        type: "tuple",
        components: [
          { name: "vendor", type: "address" },
          { name: "payee", type: "address" },
          { name: "specHash", type: "bytes32" },
          { name: "qty", type: "uint128" },
          { name: "unitPrice", type: "uint128" },
          { name: "priceTolBps", type: "uint16" },
          { name: "qtyTolBps", type: "uint16" },
          { name: "expiry", type: "uint64" },
        ],
      },
      {
        name: "a",
        type: "tuple",
        components: [
          { name: "personId", type: "bytes32" },
          { name: "role", type: "uint8" },
          { name: "expiry", type: "uint64" },
          { name: "poId", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "sig", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "poId", type: "uint256" }],
  },
  {
    type: "function",
    name: "attestReceipt",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poId", type: "uint256" },
      { name: "qty", type: "uint128" },
      { name: "deliverableHash", type: "bytes32" },
      {
        name: "a",
        type: "tuple",
        components: [
          { name: "personId", type: "bytes32" },
          { name: "role", type: "uint8" },
          { name: "expiry", type: "uint64" },
          { name: "poId", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "sig", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitInvoice",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "inv",
        type: "tuple",
        components: [
          { name: "poId", type: "uint256" },
          { name: "vendor", type: "address" },
          { name: "payee", type: "address" },
          { name: "qty", type: "uint128" },
          { name: "unitPrice", type: "uint128" },
          { name: "invoiceHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint64" },
        ],
      },
      { name: "vendorSig", type: "bytes" },
    ],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "previewInvoice",
    stateMutability: "view",
    inputs: [
      {
        name: "inv",
        type: "tuple",
        components: [
          { name: "poId", type: "uint256" },
          { name: "vendor", type: "address" },
          { name: "payee", type: "address" },
          { name: "qty", type: "uint128" },
          { name: "unitPrice", type: "uint128" },
          { name: "invoiceHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint64" },
        ],
      },
      { name: "vendorSig", type: "bytes" },
    ],
    outputs: [
      { name: "reasonMask", type: "uint32" },
      { name: "outcome", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "cancelPO",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poId", type: "uint256" },
      {
        name: "a",
        type: "tuple",
        components: [
          { name: "personId", type: "bytes32" },
          { name: "role", type: "uint8" },
          { name: "expiry", type: "uint64" },
          { name: "poId", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "sig", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  { type: "function", name: "totalEncumbered", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "unencumberedBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextPoId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "Decision",
    inputs: [
      { name: "poId", type: "uint256", indexed: true },
      { name: "invoiceHash", type: "bytes32", indexed: false },
      { name: "outcome", type: "uint8", indexed: false },
      { name: "reasonMask", type: "uint32", indexed: false },
      { name: "paid", type: "uint256", indexed: false },
      { name: "holdId", type: "uint256", indexed: false },
      { name: "journalDigest", type: "bytes32", indexed: false },
      { name: "preimage", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "POCreated",
    inputs: [
      { name: "poId", type: "uint256", indexed: true },
      { name: "vendor", type: "address", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "qty", type: "uint128", indexed: false },
      { name: "unitPrice", type: "uint128", indexed: false },
      { name: "encumbered", type: "uint256", indexed: false },
      { name: "creatorPersonId", type: "bytes32", indexed: false },
      { name: "journalDigest", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
