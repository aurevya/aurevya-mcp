import { createProposal } from './lib/proposal.js';
(async () => {
  const result = await createProposal({
    clientName: 'Style Check',
    company: 'ac',
    trust: false,
    cis: false,
    nominee: false,
    currency: 'USD',
  });
  console.log('PDF at:', result.pdfPath);
})().catch(e => { console.error(e); process.exit(1); });
