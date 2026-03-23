import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { MagnifyingGlass, Package, UserCircle, X, CircleNotch } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { SearchResult } from '@/lib/search';
import { useGlobalSearch } from '@/hooks/api/use-global-search';

export const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: apiResults, isLoading: isSearching } = useGlobalSearch(debouncedQuery);
  const results: SearchResult[] = apiResults ?? [];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setDebouncedQuery('');
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query);
      setIsOpen(true);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (apiResults && debouncedQuery.length >= 2) {
      setIsOpen(true);
    }
  }, [apiResults, debouncedQuery]);

  const handleResultClick = () => {
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative w-full max-w-md" ref={searchRef}>
      <div className="relative">
        <MagnifyingGlass size={16} weight="bold" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          placeholder="Buscar... (Ctrl+K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-8 bg-muted/40 border-transparent text-[13px] focus-visible:bg-card focus-visible:border-border/80 placeholder:text-muted-foreground/40"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
          >
            {isSearching ? (
              <CircleNotch size={14} weight="bold" className="animate-spin" />
            ) : (
              <X size={14} weight="bold" />
            )}
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-11 w-full max-h-80 overflow-y-auto z-50 bg-card border border-border/80 rounded-xl shadow-premium-xl animate-scale-in">
          <div className="p-1.5 space-y-0.5">
            {results.map((result) => (
              <Link
                to={result.link}
                key={result.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent rounded-lg transition-colors group"
                onClick={handleResultClick}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  result.type === 'envio' ? 'bg-primary/8' : 'bg-success/8'
                }`}>
                  {result.type === 'envio' && <Package size={16} weight="duotone" className="text-primary" />}
                  {result.type === 'cliente' && <UserCircle size={16} weight="duotone" className="text-success" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[13px] group-hover:text-primary transition-colors truncate">
                    {result.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{result.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute top-11 w-full z-50 bg-card border border-border/80 rounded-xl shadow-premium-xl p-6 animate-scale-in">
          <div className="text-center">
            <MagnifyingGlass size={24} weight="duotone" className="text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-[13px] font-medium">Sin resultados</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Intenta con otro termino
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
