import * as CountryFlags from 'country-flag-icons/react/3x2';
import type { ReactNode } from 'react';

type FlagComponent = (props: { className?: string }) => ReactNode;

interface FlagProps {
  code: string;
  className?: string;
}

export const Flag = ({ code, className }: FlagProps) => {
  if (code.length !== 2) return null;
  const Component = (CountryFlags as Record<string, FlagComponent>)[code.toUpperCase()];
  if (!Component) return null;
  return <Component className={className} />;
};
