export const RULE_VERSION = "1.0.0";
export const RULES = {
  "EP-VALID": {
    technique: "Equivalence partitioning",
    description: "Deterministic representative of the valid partition",
    types: "all",
  },
  "EP-EMPTY": {
    technique: "Equivalence partitioning",
    description: "Empty input under required/optional semantics",
    types: "all",
  },
  "EP-TYPE": {
    technique: "Equivalence partitioning",
    description: "Wrong primitive type or invalid typed representation",
    types: "all",
  },
  "EP-FORMAT": {
    technique: "Equivalence partitioning",
    description: "Malformed email or non-alphanumeric text",
    types: ["text", "password", "email"],
  },
  "EP-ENUM": {
    technique: "Equivalence partitioning",
    description: "Every allowed value and one disallowed value",
    types: ["enum"],
  },
  "EP-BOOLEAN": {
    technique: "Equivalence partitioning",
    description: "True and false partitions",
    types: ["boolean"],
  },
  "EP-PRECISION": {
    technique: "Equivalence partitioning",
    description: "Extra decimal digit and off-step value",
    types: ["decimal"],
  },
  "BVA-LENGTH": {
    technique: "Boundary-value analysis",
    description: "Length bound minus one, bound, bound plus one",
    types: ["text", "password", "email"],
  },
  "BVA-NUMBER": {
    technique: "Boundary-value analysis",
    description: "Numeric bound and adjacent declared step values",
    types: ["integer", "decimal"],
  },
  "BVA-DATE": {
    technique: "Boundary-value analysis",
    description: "Date bound and adjacent calendar dates",
    types: ["date"],
  },
};
export function applicable(rule, r) {
  if(typeof rule!=='string'||!Object.hasOwn(RULES,rule))return false;
  const a = RULES[rule];
  return !!a && (a.types === "all" || a.types.includes(r.type));
}
