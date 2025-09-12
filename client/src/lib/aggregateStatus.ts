import { RiskStatus } from '@/types';

export function aggregateStatus(statuses: RiskStatus[]): RiskStatus {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('yellow')) return 'yellow';
  return 'green';
}

export function getStatusLabel(status: RiskStatus, openIssues: number, overriddenIssues: number): string {
  switch (status) {
    case 'red':
      return openIssues > 1 ? `${openIssues} Critical` : '1 Critical';
    case 'yellow':
      return openIssues > 1 ? `${openIssues} Warnings` : openIssues === 1 ? '1 Warning' : 'Warnings';
    case 'green':
      return 'Green';
    default:
      return 'Unknown';
  }
}

export function getStatusColor(status: RiskStatus) {
  switch (status) {
    case 'red':
      return 'bg-red-100 text-red-800';
    case 'yellow':
      return 'bg-yellow-100 text-yellow-800';
    case 'green':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusDotColor(status: RiskStatus) {
  switch (status) {
    case 'red':
      return 'bg-red-500';
    case 'yellow':
      return 'bg-yellow-500';
    case 'green':
      return 'bg-green-500';
    default:
      return 'bg-gray-500';
  }
}
