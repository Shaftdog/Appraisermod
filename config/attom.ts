export const ATTOM = {
  baseUrl: 'https://api.gateway.attomdata.com', // do not change
  headers: (key: string) => ({ 'Accept': 'application/json', 'apikey': key }),
  counties: ['Seminole', 'Orange', 'Volusia'], // starter scope for Mid-Florida
  monthsBackClosedSales: 24,
};