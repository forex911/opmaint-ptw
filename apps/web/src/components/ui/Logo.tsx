import React from 'react';

export interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', className = '', ...props }) => {
  const sizeClasses = {
    sm: 'w-6 h-6 rounded-lg',
    md: 'w-9 h-9 rounded-xl',
    lg: 'w-11 h-11 rounded-2xl',
    xl: 'w-14 h-14 rounded-2xl',
  };

  return (
    <img
      src="/logo.png"
      alt="OPMAINT Logo"
      className={`object-contain shrink-0 shadow-sm ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
};
