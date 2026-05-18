import { describe, it, expect } from "vitest";
import { parseEcbXml } from "@/lib/quotes/ecb";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time="2025-05-16">
      <Cube currency="USD" rate="1.1175"/>
      <Cube currency="GBP" rate="0.8395"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("parseEcbXml", () => {
  it("yields rate rows", () => {
    const rows = parseEcbXml(XML);
    expect(rows).toEqual(expect.arrayContaining([
      { date: "2025-05-16", fromCurrency: "USD", toCurrency: "EUR", rate: "1.1175" },
      { date: "2025-05-16", fromCurrency: "GBP", toCurrency: "EUR", rate: "0.8395" },
    ]));
  });
});
