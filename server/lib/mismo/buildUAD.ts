import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { HabuState, UseEvaluation, HabuTestScore } from '@shared/habu';

interface UADInput {
  orderId: string;
  subject: {
    address: string;
    apn?: string;
    legal?: string;
    gla: number;
    yearBuilt: number;
    siteSize?: number;
    propertyType: string;
  };
  comps: Array<{
    id: string;
    address: string;
    saleDate: string;
    salePrice: number;
    distance: number;
    gla: number;
    adjustments: any[];
    netAdjustment: number;
    adjustedValue: number;
  }>;
  timeAdjustment: {
    basis: string;
    pctPerMonth: number;
    effectiveDateISO: string;
  };
  marketMetrics: {
    trendPctPerMonth: number;
    monthsOfInventory: number | null;
    domMedian: number | null;
    spToLpMedian: number | null;
  };
  appraiser: {
    name: string;
    license: string;
    company: string;
  };
  effectiveDate: string;
  intendedUse: string;
  reconciledValue?: number;
  habuState?: HabuState | null; // HABU integration
}

interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

interface UADResult {
  xml: string;
  validation: ValidationResult;
}

const USE_CATEGORY_LABELS: Record<string, string> = {
  singleFamily: 'Single Family Residential',
  multiFamily: 'Multi-Family Residential',
  townhome: 'Townhome',
  condo: 'Condominium',
  office: 'Office',
  retail: 'Retail',
  industrial: 'Industrial',
  mixedUse: 'Mixed Use',
  ag: 'Agricultural',
  specialPurpose: 'Special Purpose',
  vacantResidential: 'Vacant Residential',
  vacantCommercial: 'Vacant Commercial'
};

// Map internal use categories to official MISMO 2.6 enum values
function mapUseToMismoEnum(useCategory: string): string {
  const mismoMapping: Record<string, string> = {
    singleFamily: 'SingleFamily',
    multiFamily: 'TwoToFourFamily', // MISMO doesn't have MultiFamilyResidential
    townhome: 'Townhouse',
    condo: 'Condominium',
    office: 'Office',
    retail: 'Retail',
    industrial: 'Industrial',
    mixedUse: 'MixedUse',
    ag: 'Farm',
    specialPurpose: 'SpecialPurpose',
    vacantResidential: 'VacantResidential',
    vacantCommercial: 'VacantCommercial'
  };
  return mismoMapping[useCategory] || 'Other';
}

// Get MISMO-compliant use description for 'Other' category
function getUseDescription(useCategory: string): string | undefined {
  const mismoMapping: Record<string, string> = {
    singleFamily: 'SingleFamily',
    multiFamily: 'TwoToFourFamily',
    townhome: 'Townhouse', 
    condo: 'Condominium',
    office: 'Office',
    retail: 'Retail',
    industrial: 'Industrial',
    mixedUse: 'MixedUse',
    ag: 'Farm',
    specialPurpose: 'SpecialPurpose',
    vacantResidential: 'VacantResidential',
    vacantCommercial: 'VacantCommercial'
  };
  
  // Return description for 'Other' category
  if (!mismoMapping[useCategory]) {
    return USE_CATEGORY_LABELS[useCategory] || useCategory;
  }
  return undefined;
}

export function buildUAD26XML(input: UADInput): UADResult {
  const validation: ValidationResult = {
    isValid: true,
    warnings: [],
    errors: []
  };

  // Validate required fields
  if (!input.subject.address) {
    validation.errors.push('Subject property address is required');
  }
  if (!input.appraiser.name) {
    validation.errors.push('Appraiser name is required');
  }
  if (!input.appraiser.license) {
    validation.errors.push('Appraiser license is required');
  }

  // Add warnings for missing optional fields
  if (!input.subject.apn) {
    validation.warnings.push('APN not available for subject property');
  }
  if (input.comps.length < 3) {
    validation.warnings.push(`Only ${input.comps.length} comparables provided, recommend minimum 3`);
  }

  // HABU validation and warnings
  if (input.habuState) {
    if (!input.habuState.result) {
      validation.warnings.push('HABU analysis incomplete - no results available');
    } else if (!input.habuState.result.asIfVacantConclusion.narrative) {
      validation.warnings.push('HABU narrative not provided');
    }

    // Check for critical HABU issues
    if (input.habuState.result?.rankedUses.some((evaluation: UseEvaluation) => 
      evaluation.flags.includes('zoningConflict')
    )) {
      validation.warnings.push('HABU analysis contains zoning conflicts');
    }

    if (input.habuState.result?.asIfVacantConclusion.confidence && 
        input.habuState.result.asIfVacantConclusion.confidence < 0.7) {
      validation.warnings.push(`HABU conclusion confidence is ${(input.habuState.result.asIfVacantConclusion.confidence * 100).toFixed(0)}% (below recommended 70%)`);
    }
  } else {
    validation.warnings.push('HABU (Highest and Best Use) analysis not performed');
  }

  validation.isValid = validation.errors.length === 0;

  // Build XML structure
  const xmlStructure = {
    'MESSAGE': {
      '@_MISMOVersionID': '2.6',
      '@_xmlns': 'http://www.mismo.org/residential/2009/schemas',
      '@_xmlns:xlink': 'http://www.w3.org/1999/xlink',
      '@_xmlns:habu': 'urn:appraisal:habu:v1',
      'ABOUT_VERSIONS': {
        'ABOUT_VERSION': {
          '@_DataVersionIdentifier': '1.0',
          '@_DataVersionName': 'UAD Export'
        }
      },
      'DEAL_SETS': {
        'DEAL_SET': {
          'DEALS': {
            'DEAL': {
              '@_xlink:label': 'DEAL',
              'ASSETS': {
                'ASSET': {
                  '@_xlink:label': 'ASSET',
                  'OWNED_PROPERTY': {
                    'PROPERTY': {
                      '@_xlink:label': 'SUBJECT_PROPERTY',
                      'ADDRESS': {
                        'AddressLineText': input.subject.address
                      },
                      'PROPERTY_DETAIL': {
                        'GrossLivingAreaSquareFeetCount': input.subject.gla,
                        'PropertyStructureBuiltYear': input.subject.yearBuilt,
                        'PropertyUsageType': input.subject.propertyType,
                        // Native MISMO HBU fields in PROPERTY_DETAIL
                        'PropertyHighestAndBestUseType': input.habuState?.result ? mapUseToMismoEnum(input.habuState.result.asIfVacantConclusion.use) : undefined,
                        'PropertyCurrentUseType': input.subject.propertyType
                      },
                      'SALES_CONTRACTS': input.comps.map((comp, index) => ({
                        'SALES_CONTRACT': {
                          '@_xlink:label': `COMPARABLE_${index + 1}`,
                          'SALES_CONTRACT_DETAIL': {
                            'SalesContractDate': comp.saleDate,
                            'SalesContractAmount': comp.salePrice
                          },
                          'PROPERTY_VALUATIONS': {
                            'PROPERTY_VALUATION': {
                              'PROPERTY_VALUATION_DETAIL': {
                                'PropertyValuationAmount': comp.adjustedValue,
                                'PropertyValuationMethodType': 'Sales Comparison'
                              }
                            }
                          }
                        }
                      }))
                    }
                  }
                }
              },
              'SERVICES': {
                'SERVICE': {
                  '@_xlink:label': 'SERVICE',
                  'APPRAISAL': {
                    'APPRAISAL_DETAIL': {
                      'AppraisalEffectiveDate': input.effectiveDate,
                      'AppraisalReportDate': new Date().toISOString().split('T')[0],
                      'IntendedUseType': input.intendedUse,
                      // Native MISMO HBU field in APPRAISAL_DETAIL
                      'HighestAndBestUseAnalyzedIndicator': input.habuState?.result ? 'true' : 'false'
                    },
                    // MISMO-compliant EXTENSION for detailed HABU data
                    'EXTENSION': input.habuState?.result ? {
                      'habu:HighestBestUseAnalysis': buildHabuSection(input.habuState)
                    } : undefined
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  // HABU data is now properly handled in EXTENSION container above

  // Convert to XML
  const builder = new XMLBuilder({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    format: true,
    indentBy: '  ',
    processEntities: false
  });

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(xmlStructure);

  return { xml, validation };
}

function buildHabuSection(habuState: HabuState): any {
  if (!habuState.result) return {};

  const conclusion = habuState.result.asIfVacantConclusion;
  const rankedUses = habuState.result.rankedUses;

  return {
    'habu:AnalysisType': habuState.inputs.asIfVacant ? 'As If Vacant' : 'As Improved',
    'habu:EffectiveDate': habuState.inputs.asOfDateISO.split('T')[0],
    'habu:HighestBestUseConclusion': {
      'habu:ConcludedUse': USE_CATEGORY_LABELS[conclusion.use] || conclusion.use,
      'habu:ConfidenceLevel': Math.round(conclusion.confidence * 100),
      'habu:AnalysisNarrative': conclusion.narrative || 'See appraiser narrative for detailed analysis.'
    },
    'habu:CandidateUses': {
      'habu:CandidateUse': rankedUses.map((evaluation: UseEvaluation, index: number) => ({
        '@_Rank': index + 1,
        'habu:UseType': USE_CATEGORY_LABELS[evaluation.use] || evaluation.use,
        'habu:CompositeScore': Math.round(evaluation.composite * 100),
        'habu:FourTests': {
          'habu:PhysicallyPossible': {
            'habu:Score': Math.round((evaluation.tests.find((t: HabuTestScore) => t.label === 'Physically Possible')?.score || 0) * 100),
            'habu:Rationale': evaluation.tests.find((t: HabuTestScore) => t.label === 'Physically Possible')?.rationale || ''
          },
          'habu:LegallyPermissible': {
            'habu:Score': Math.round((evaluation.tests.find((t: HabuTestScore) => t.label === 'Legally Permissible')?.score || 0) * 100),
            'habu:Rationale': evaluation.tests.find((t: HabuTestScore) => t.label === 'Legally Permissible')?.rationale || ''
          },
          'habu:FinanciallyFeasible': {
            'habu:Score': Math.round((evaluation.tests.find((t: HabuTestScore) => t.label === 'Financially Feasible')?.score || 0) * 100),
            'habu:Rationale': evaluation.tests.find((t: HabuTestScore) => t.label === 'Financially Feasible')?.rationale || ''
          },
          'habu:MaximallyProductive': {
            'habu:Score': Math.round((evaluation.tests.find((t: HabuTestScore) => t.label === 'Maximally Productive')?.score || 0) * 100),
            'habu:Rationale': evaluation.tests.find((t: HabuTestScore) => t.label === 'Maximally Productive')?.rationale || ''
          }
        },
        'habu:Flags': evaluation.flags.length > 0 ? {
          'habu:Flag': evaluation.flags.map((flag: string) => ({ 'habu:FlagType': flag }))
        } : undefined
      }))
    },
    'habu:TestWeights': {
      'habu:PhysicalWeight': Math.round((habuState.result.weights?.physical || 0.25) * 100),
      'habu:LegalWeight': Math.round((habuState.result.weights?.legal || 0.35) * 100),
      'habu:FinancialWeight': Math.round((habuState.result.weights?.financial || 0.30) * 100),
      'habu:ProductiveWeight': Math.round((habuState.result.weights?.productive || 0.10) * 100)
    },
    'habu:AnalysisMetadata': {
      'habu:Version': habuState.result.version,
      'habu:GeneratedAt': habuState.result.generatedAt,
      'habu:Author': habuState.result.author || 'System Generated'
    }
  };
}

// Helper function to validate HABU data completeness
export function validateHabuForExport(habuState: HabuState | null): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!habuState) {
    issues.push('HABU analysis not performed');
    return { isValid: false, issues };
  }

  if (!habuState.result) {
    issues.push('HABU analysis incomplete - no results available');
    return { isValid: false, issues };
  }

  if (!habuState.result.asIfVacantConclusion.narrative) {
    issues.push('HABU narrative documentation missing');
  }

  if (habuState.result.asIfVacantConclusion.confidence < 0.5) {
    issues.push('HABU conclusion confidence too low for export');
  }

  if (habuState.result.rankedUses.length < 2) {
    issues.push('Insufficient candidate uses analyzed (minimum 2 required)');
  }

  // Check for critical flags
  const criticalFlags = habuState.result.rankedUses.some((evaluation: UseEvaluation) => 
    evaluation.flags.includes('zoningConflict')
  );
  if (criticalFlags) {
    issues.push('Unresolved critical issues in HABU analysis');
  }

  return { isValid: issues.length === 0, issues };
}