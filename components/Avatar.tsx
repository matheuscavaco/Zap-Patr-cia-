import React from 'react';

interface AvatarProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-10 h-10 md:w-12 md:h-12', // Responsive default
  };

  return (
    <div className={`relative rounded-full overflow-hidden bg-gray-300 flex-shrink-0 ${sizeClasses[size]}`}>
      <img src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
};
