// Master list of all supplements for ad-hoc logging
// These are NOT the daily tracked supplements - these are for one-off logging

export interface SupplementLibraryItem {
  name: string;
  category: string;
  defaultAmount: number;
  unit: string;
}

export const SUPPLEMENT_LIBRARY: SupplementLibraryItem[] = [
  // Amino Acids & Protein
  { name: "Alpha GPC", category: "Nootropics", defaultAmount: 300, unit: "mg" },
  { name: "L-Theanine", category: "Amino Acids", defaultAmount: 200, unit: "mg" },
  { name: "L-Glutamine", category: "Amino Acids", defaultAmount: 5, unit: "g" },
  { name: "L-Tyrosine", category: "Amino Acids", defaultAmount: 500, unit: "mg" },
  { name: "Glycine", category: "Amino Acids", defaultAmount: 3, unit: "g" },
  { name: "Taurine", category: "Amino Acids", defaultAmount: 1000, unit: "mg" },
  { name: "L-Carnitine", category: "Amino Acids", defaultAmount: 1000, unit: "mg" },
  { name: "Acetyl-L-Carnitine", category: "Amino Acids", defaultAmount: 500, unit: "mg" },
  { name: "BCAAs", category: "Amino Acids", defaultAmount: 5, unit: "g" },
  { name: "Beta-Alanine", category: "Amino Acids", defaultAmount: 3, unit: "g" },
  { name: "Citrulline", category: "Amino Acids", defaultAmount: 6, unit: "g" },
  { name: "Collagen", category: "Protein", defaultAmount: 10, unit: "g" },
  { name: "Protein Powder", category: "Protein", defaultAmount: 25, unit: "g" },

  // Nootropics & Brain
  { name: "Lion's Mane", category: "Nootropics", defaultAmount: 1000, unit: "mg" },
  { name: "Bacopa Monnieri", category: "Nootropics", defaultAmount: 300, unit: "mg" },
  { name: "Phosphatidylserine", category: "Nootropics", defaultAmount: 100, unit: "mg" },
  { name: "Ginkgo Biloba", category: "Nootropics", defaultAmount: 120, unit: "mg" },
  { name: "CDP-Choline", category: "Nootropics", defaultAmount: 250, unit: "mg" },
  { name: "Huperzine A", category: "Nootropics", defaultAmount: 200, unit: "mcg" },

  // Adaptogens & Herbs
  { name: "Ashwagandha", category: "Adaptogens", defaultAmount: 600, unit: "mg" },
  { name: "Rhodiola Rosea", category: "Adaptogens", defaultAmount: 400, unit: "mg" },
  { name: "Maca Root", category: "Adaptogens", defaultAmount: 1500, unit: "mg" },
  { name: "Tongkat Ali", category: "Adaptogens", defaultAmount: 400, unit: "mg" },
  { name: "Fadogia Agrestis", category: "Adaptogens", defaultAmount: 600, unit: "mg" },
  { name: "Cordyceps", category: "Adaptogens", defaultAmount: 1000, unit: "mg" },
  { name: "Reishi", category: "Adaptogens", defaultAmount: 1000, unit: "mg" },
  { name: "Shilajit", category: "Adaptogens", defaultAmount: 500, unit: "mg" },
  { name: "Ginseng", category: "Adaptogens", defaultAmount: 400, unit: "mg" },

  // Anti-inflammatory
  { name: "Turmeric/Curcumin", category: "Anti-inflammatory", defaultAmount: 500, unit: "mg" },
  { name: "Ginger", category: "Anti-inflammatory", defaultAmount: 1000, unit: "mg" },
  { name: "Boswellia", category: "Anti-inflammatory", defaultAmount: 500, unit: "mg" },
  { name: "Quercetin", category: "Anti-inflammatory", defaultAmount: 500, unit: "mg" },

  // Sleep & Relaxation
  { name: "GABA", category: "Sleep", defaultAmount: 500, unit: "mg" },
  { name: "5-HTP", category: "Sleep", defaultAmount: 100, unit: "mg" },
  { name: "Magnesium Threonate", category: "Sleep", defaultAmount: 2000, unit: "mg" },
  { name: "Lemon Balm", category: "Sleep", defaultAmount: 500, unit: "mg" },
  { name: "Passionflower", category: "Sleep", defaultAmount: 500, unit: "mg" },
  { name: "Valerian Root", category: "Sleep", defaultAmount: 500, unit: "mg" },
  { name: "Tryptophan", category: "Sleep", defaultAmount: 500, unit: "mg" },

  // Minerals
  { name: "Iron", category: "Minerals", defaultAmount: 18, unit: "mg" },
  { name: "Calcium", category: "Minerals", defaultAmount: 1000, unit: "mg" },
  { name: "Potassium", category: "Minerals", defaultAmount: 500, unit: "mg" },
  { name: "Selenium", category: "Minerals", defaultAmount: 200, unit: "mcg" },
  { name: "Boron", category: "Minerals", defaultAmount: 3, unit: "mg" },
  { name: "Iodine", category: "Minerals", defaultAmount: 150, unit: "mcg" },
  { name: "Copper", category: "Minerals", defaultAmount: 2, unit: "mg" },
  { name: "Chromium", category: "Minerals", defaultAmount: 200, unit: "mcg" },

  // Longevity & Antioxidants
  { name: "CoQ10", category: "Longevity", defaultAmount: 200, unit: "mg" },
  { name: "NAC", category: "Longevity", defaultAmount: 600, unit: "mg" },
  { name: "Alpha Lipoic Acid", category: "Longevity", defaultAmount: 300, unit: "mg" },
  { name: "Resveratrol", category: "Longevity", defaultAmount: 500, unit: "mg" },
  { name: "NMN", category: "Longevity", defaultAmount: 250, unit: "mg" },
  { name: "PQQ", category: "Longevity", defaultAmount: 20, unit: "mg" },
  { name: "Glutathione", category: "Longevity", defaultAmount: 500, unit: "mg" },
  { name: "Astaxanthin", category: "Longevity", defaultAmount: 12, unit: "mg" },

  // Gut Health
  { name: "Probiotics", category: "Gut Health", defaultAmount: 10, unit: "B CFU" },
  { name: "Digestive Enzymes", category: "Gut Health", defaultAmount: 1, unit: "caps" },
  { name: "Psyllium Husk", category: "Gut Health", defaultAmount: 5, unit: "g" },
  { name: "Apple Cider Vinegar", category: "Gut Health", defaultAmount: 15, unit: "ml" },
  { name: "Berberine", category: "Gut Health", defaultAmount: 500, unit: "mg" },

  // Joint Support
  { name: "Glucosamine", category: "Joint Support", defaultAmount: 1500, unit: "mg" },
  { name: "Chondroitin", category: "Joint Support", defaultAmount: 1200, unit: "mg" },
  { name: "MSM", category: "Joint Support", defaultAmount: 1000, unit: "mg" },
  { name: "Hyaluronic Acid", category: "Joint Support", defaultAmount: 200, unit: "mg" },

  // Liver & Detox
  { name: "Milk Thistle", category: "Liver", defaultAmount: 250, unit: "mg" },
  { name: "TUDCA", category: "Liver", defaultAmount: 500, unit: "mg" },
  { name: "Chlorella", category: "Detox", defaultAmount: 3, unit: "g" },
  { name: "Spirulina", category: "Detox", defaultAmount: 3, unit: "g" },

  // Heart & Circulation
  { name: "Garlic Extract", category: "Heart", defaultAmount: 600, unit: "mg" },
  { name: "Nattokinase", category: "Heart", defaultAmount: 2000, unit: "FU" },
  { name: "Beetroot Powder", category: "Heart", defaultAmount: 5, unit: "g" },
  { name: "Hawthorn Berry", category: "Heart", defaultAmount: 500, unit: "mg" },

  // Eye Health
  { name: "Lutein", category: "Eye Health", defaultAmount: 20, unit: "mg" },
  { name: "Zeaxanthin", category: "Eye Health", defaultAmount: 4, unit: "mg" },

  // Immune
  { name: "Elderberry", category: "Immune", defaultAmount: 500, unit: "mg" },
  { name: "Echinacea", category: "Immune", defaultAmount: 400, unit: "mg" },
  { name: "Beta Glucan", category: "Immune", defaultAmount: 250, unit: "mg" },
  { name: "Astragalus", category: "Immune", defaultAmount: 500, unit: "mg" },

  // Hormones
  { name: "DIM", category: "Hormones", defaultAmount: 200, unit: "mg" },
  { name: "DHEA", category: "Hormones", defaultAmount: 25, unit: "mg" },
  { name: "Fenugreek", category: "Hormones", defaultAmount: 600, unit: "mg" },

  // Peptides
  { name: "Melanotan I", category: "Peptides", defaultAmount: 0.5, unit: "mg" },
  { name: "Melanotan II", category: "Peptides", defaultAmount: 0.25, unit: "mg" },
  { name: "Retatrutide", category: "Peptides", defaultAmount: 5, unit: "mg" },
  { name: "Tirzepatide", category: "Peptides", defaultAmount: 5, unit: "mg" },
  { name: "BPC-157", category: "Peptides", defaultAmount: 250, unit: "mcg" },
  { name: "TB-500", category: "Peptides", defaultAmount: 2.5, unit: "mg" },

  // Other
  { name: "Black Seed Oil", category: "Other", defaultAmount: 5, unit: "ml" },
  { name: "CBD Oil", category: "Other", defaultAmount: 25, unit: "mg" },
  { name: "Electrolytes", category: "Other", defaultAmount: 1, unit: "serving" },
  { name: "Inositol", category: "Other", defaultAmount: 2, unit: "g" },
  { name: "Omega-3 (EPA/DHA)", category: "Other", defaultAmount: 1000, unit: "mg" },
  { name: "Krill Oil", category: "Other", defaultAmount: 1000, unit: "mg" },
  { name: "MCT Oil", category: "Other", defaultAmount: 15, unit: "ml" },
  { name: "Pre-Workout", category: "Other", defaultAmount: 1, unit: "scoop" },
];

// Get all unique categories
export function getSupplementCategories(): string[] {
  return [...new Set(SUPPLEMENT_LIBRARY.map((s) => s.category))].sort();
}

// Search supplements by name
export function searchSupplements(query: string): SupplementLibraryItem[] {
  const lowerQuery = query.toLowerCase();
  return SUPPLEMENT_LIBRARY.filter((s) =>
    s.name.toLowerCase().includes(lowerQuery) ||
    s.category.toLowerCase().includes(lowerQuery)
  );
}

// Get supplements by category
export function getSupplementsByCategory(category: string): SupplementLibraryItem[] {
  return SUPPLEMENT_LIBRARY.filter((s) => s.category === category);
}
