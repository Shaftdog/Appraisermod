import { XMLBuilder } from 'fast-xml-parser';

export interface SubjectData {
  address: string;
  apn?: string;
  legal?: string;
  gla: number;
  yearBuilt: number;
  siteSize?: number;
  propertyType: string;
}

export interface CompData {
  id: string;
  address: string;
  saleDate: string;
  salePrice: number;
  distance: number;
  gla: number;
  adjustments?: Array<{ element: string; amount: number; reason: string }>;
  netAdjustment?: number;
  adjustedValue?: number;
}

export interface TimeAdjustment {
  basis: string;
  rate: number;
  effectiveDate: string;
}

export interface MarketMetrics {
  trendPerMonth: number;
  monthsOfInventory: number;
  daysOnMarket: number;
  salePriceToListPrice: number;
}

export interface AppraiserInfo {
  name: string;
  license: string;
  company?: string;
}

export interface ReviewerInfo {
  name: string;
  role: string;
  company?: string;
}

export interface UADInput {
  orderId: string;
  subject: SubjectData;
  borrower?: { name: string };
  client?: { name: string };
  comps: CompData[];
  timeAdjustment: TimeAdjustment;
  marketMetrics: MarketMetrics;
  appraiser: AppraiserInfo;
  reviewer?: ReviewerInfo;
  effectiveDate: string;
  intendedUse?: string;
  reconciledValue?: number;
  narrative?: string;
  appraiserSignedAt?: string;
  reviewerSignedAt?: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

/**
 * Validate UAD input data for required fields
 */
export function validateUADInput(input: UADInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!input.subject.address) errors.push('Subject address is required');
  if (!input.effectiveDate) errors.push('Effective date is required');
  if (input.comps.length < 3) errors.push('At least 3 comparables are required');
  if (!input.timeAdjustment.basis) errors.push('Time adjustment basis is required');
  if (!input.timeAdjustment.rate && input.timeAdjustment.rate !== 0) errors.push('Time adjustment rate is required');
  if (!input.appraiser.name) errors.push('Appraiser name is required');
  if (!input.appraiser.license) errors.push('Appraiser license is required');

  // Validate comps
  input.comps.forEach((comp, index) => {
    if (!comp.saleDate) errors.push(`Comp ${index + 1}: Sale date is required`);
    if (!comp.salePrice) errors.push(`Comp ${index + 1}: Sale price is required`);
    if (!comp.gla) errors.push(`Comp ${index + 1}: GLA is required`);
  });

  // Warning for optional but recommended fields
  if (!input.subject.apn) warnings.push('Subject APN is missing');
  if (!input.subject.legal) warnings.push('Subject legal description is missing');
  if (!input.borrower?.name) warnings.push('Borrower name is missing');
  if (!input.client?.name) warnings.push('Client name is missing');
  if (!input.reconciledValue) warnings.push('Reconciled value is missing');

  return {
    errors,
    warnings,
    isValid: errors.length === 0
  };
}

/**
 * Build MISMO 2.6 UAD XML from order data
 */
export function buildUAD26XML(input: UADInput): { xml: string; validation: ValidationResult } {
  const validation = validateUADInput(input);
  
  if (!validation.isValid) {
    return {
      xml: '',
      validation
    };
  }

  const xmlData = {
    MESSAGE: {
      '@_xmlns': 'http://www.mismo.org/residential/2009/schemas',
      '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@_MISMOReferenceModelIdentifier': '2.6',
      ABOUT_VERSIONS: {
        ABOUT_VERSION: {
          CreatedDatetime: new Date().toISOString()
        }
      },
      DEAL_SETS: {
        DEAL_SET: {
          DEALS: {
            DEAL: {
              COLLATERALS: {
                COLLATERAL: {
                  SUBJECT_PROPERTY: buildSubjectProperty(input),
                  ...(input.comps.length > 0 && {
                    COMPARABLE_PROPERTIES: {
                      COMPARABLE_PROPERTY: input.comps.map((comp, index) => buildComparableProperty(comp, index + 1))
                    }
                  })
                }
              },
              ...(input.appraiser && {
                SERVICES: {
                  SERVICE: {
                    APPRAISAL: {
                      APPRAISAL_DETAIL: {
                        AppraisalMethodType: 'SalesComparison',
                        PropertyAppraisalEffectiveDate: input.effectiveDate,
                        PropertyIntendedUseType: input.intendedUse || 'Purchase',
                        PropertyValuationEffectiveDate: input.effectiveDate,
                        ...(input.reconciledValue && {
                          PropertyAppraisalAmount: input.reconciledValue
                        })
                      },
                      APPRAISAL_PROFESSIONALS: {
                        APPRAISAL_PROFESSIONAL: buildAppraisalProfessionals(input)
                      },
                      ...(input.marketMetrics && {
                        MARKET_CONDITIONS: buildMarketConditions(input.marketMetrics, input.timeAdjustment)
                      })
                    }
                  }
                }
              })
            }
          }
        }
      }
    }
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    indentBy: '  ',
    suppressEmptyNode: true
  });

  const xml = builder.build(xmlData);
  
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`,
    validation
  };
}

function formatAddress(address: string) {
  // Simple address parsing - in production, use more sophisticated parsing
  const parts = address.split(',').map(p => p.trim());
  return {
    AddressLineText: parts[0] || address,
    CityName: parts[1] || '',
    StateCode: parts[2] || '',
    PostalCode: parts[3] || ''
  };
}

function buildSubjectProperty(input: UADInput) {
  return {
    ADDRESS: formatAddress(input.subject.address),
    ...(input.subject.apn && { AssessorParcelIdentifier: input.subject.apn }),
    ...(input.subject.legal && { LegalDescriptionText: input.subject.legal }),
    PROPERTY_DETAIL: {
      PropertyStructureBuiltYear: input.subject.yearBuilt,
      GrossLivingAreaSquareFeetCount: input.subject.gla,
      ...(input.subject.siteSize && { SiteAreaSquareFeetMeasure: input.subject.siteSize }),
      PropertyUsageType: mapPropertyType(input.subject.propertyType),
      ConstructionMethodType: 'SiteBuilt', // Default for UAD
      PropertyExistingConstructionType: 'Existing'
    },
    ...(input.reconciledValue && {
      PROPERTY_VALUATIONS: {
        PROPERTY_VALUATION: {
          PROPERTY_VALUATION_DETAIL: {
            PropertyValuationAmount: input.reconciledValue,
            PropertyValuationEffectiveDate: input.effectiveDate
          }
        }
      }
    })
  };
}

function buildComparableProperty(comp: CompData, sequenceNumber: number) {
  return {
    '@_SequenceNumber': sequenceNumber,
    ADDRESS: formatAddress(comp.address),
    PROPERTY_DETAIL: {
      GrossLivingAreaSquareFeetCount: comp.gla,
      PropertyStructureBuiltYear: null, // Would need this data in CompData if available
      ConstructionMethodType: 'SiteBuilt'
    },
    SALES_CONTRACTS: {
      SALES_CONTRACT: {
        SALES_CONTRACT_DETAIL: {
          SalesContractDate: comp.saleDate,
          SalesContractAmount: comp.salePrice
        },
        ...(comp.adjustments && comp.adjustments.length > 0 && {
          SALES_ADJUSTMENTS: {
            SALES_ADJUSTMENT: comp.adjustments.map(adj => ({
              SALES_ADJUSTMENT_DETAIL: {
                SalesAdjustmentItemType: mapAdjustmentElement(adj.element),
                SalesAdjustmentAmount: adj.amount,
                SalesAdjustmentDescription: adj.reason
              }
            }))
          }
        })
      }
    },
    ...(comp.distance && {
      PROXIMITY: {
        ProximityDistanceMeasure: comp.distance
      }
    }),
    ...(comp.netAdjustment !== undefined && {
      NET_ADJUSTMENT: comp.netAdjustment
    }),
    ...(comp.adjustedValue !== undefined && {
      ADJUSTED_SALES_PRICE: comp.adjustedValue
    })
  };
}

function buildMarketConditions(metrics: MarketMetrics, timeAdj: TimeAdjustment) {
  return {
    MARKET_CONDITIONS_DETAIL: {
      MarketTrendComment: `Monthly trend: ${metrics.trendPerMonth}%`,
      MonthsInventoryCount: metrics.monthsOfInventory,
      MarketConditionsComment: `Average days on market: ${metrics.daysOnMarket}. Sale price to list price ratio: ${metrics.salePriceToListPrice}`,
      ...(timeAdj && {
        TimeAdjustmentBasis: timeAdj.basis,
        TimeAdjustmentRate: timeAdj.rate,
        TimeAdjustmentEffectiveDate: timeAdj.effectiveDate
      })
    }
  };
}

function buildAppraisalProfessionals(input: UADInput): any[] {
  const professionals: any[] = [];
  
  if (input.appraiser) {
    professionals.push({
      '@_SequenceNumber': 1,
      PROFESSIONAL_DETAIL: {
        ProfessionalName: input.appraiser.name,
        ProfessionalLicenseNumber: input.appraiser.license,
        ProfessionalRoleType: 'Appraiser',
        ...(input.appraiser.company && { ProfessionalCompanyName: input.appraiser.company })
      },
      ...(input.appraiserSignedAt && {
        SIGNATURE: {
          SignatureDate: input.appraiserSignedAt
        }
      })
    });
  }
  
  if (input.reviewer) {
    professionals.push({
      '@_SequenceNumber': 2,
      PROFESSIONAL_DETAIL: {
        ProfessionalName: input.reviewer.name,
        ProfessionalRoleType: mapReviewerRole(input.reviewer.role),
        ...(input.reviewer.company && { ProfessionalCompanyName: input.reviewer.company })
      },
      ...(input.reviewerSignedAt && {
        SIGNATURE: {
          SignatureDate: input.reviewerSignedAt
        }
      })
    });
  }
  
  return professionals;
}

// Helper mapping functions for UAD compliance
function mapPropertyType(propertyType: string): string {
  const typeMap: Record<string, string> = {
    'single-family': 'PrimaryResidence',
    'condo': 'Condominium',
    'townhome': 'Townhouse',
    'pud': 'PUD'
  };
  return typeMap[propertyType.toLowerCase()] || 'PrimaryResidence';
}

function mapAdjustmentElement(element: string): string {
  const elementMap: Record<string, string> = {
    'sale_date': 'SaleOrFinancingConcessions',
    'location': 'Location',
    'site': 'Site',
    'view': 'View',
    'design': 'DesignAppeeal',
    'condition': 'QualityOfConstruction',
    'gla': 'GrossLivingArea',
    'room_count': 'RoomCount',
    'other': 'Other'
  };
  return elementMap[element.toLowerCase()] || 'Other';
}

function mapReviewerRole(role: string): string {
  const roleMap: Record<string, string> = {
    'supervisor': 'SupervisoryAppraiser',
    'reviewer': 'ReviewAppraiser',
    'qc': 'QualityControl'
  };
  return roleMap[role.toLowerCase()] || 'ReviewAppraiser';
}