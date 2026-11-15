'use client';
import {T as AppT,useAppLocale} from '@/components/i18n/AppLocaleProvider';


import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Building2, 
  Plus, 
  Search, 
  MoreVertical, 
  Mail, 
  Phone, 
  MapPin,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useTaskContext, Customer } from '@/components/TaskContext';
import { CreateCustomerModal } from '@/components/CreateCustomerModal';
import { EditCustomerModal } from '@/components/EditCustomerModal';
import { DeleteCustomerModal } from '@/components/DeleteCustomerModal';
import { toast } from 'sonner';

export function Customers() {
  const {t}=useAppLocale();
  const router=useRouter();
  const searchParams=useSearchParams();
  const requestedCustomer=searchParams.get('customer');
  const {
    customers,
    fetchCustomers,
    permissions,
    customerDirectoryLabel,
    customerSingularLabel,
  } = useTaskContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = customers.filter(customer => {
    if(requestedCustomer&&!searchQuery)return customer.id===requestedCustomer;
    const term=searchQuery.toLowerCase();
    return customer.name.toLowerCase().includes(term)||
      customer.email?.toLowerCase().includes(term)||
      Boolean(customer.phone?.includes(searchQuery));
  });

  const canManageCustomers = permissions.canEditAnyTask;

  return (
    <div className="h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{customerDirectoryLabel}</h1>
        <p className="text-muted-foreground mt-1">
          {t("Manage {entity} and track related actions",{entity:customerDirectoryLabel.toLowerCase()})}
        </p>
      </div>

      {requestedCustomer&&<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <p className="text-xs font-medium"><AppT text="Showing the selected customer from global search."/></p>
        <Button type="button" variant="outline" size="sm" onClick={()=>router.replace('/customers',{scroll:false})}><AppT text="Show all customers"/></Button>
      </div>}
      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              onFocus={()=>{if(requestedCustomer)router.replace('/customers',{scroll:false});}}
              placeholder={t("Search {entity}…",{entity:customerDirectoryLabel.toLowerCase()})}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        {canManageCustomers && (
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /><AppT text="Add Customer"/></Button>
        )}
      </div>

      {/* Customer Grid */}
      {filteredCustomers.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            {searchQuery
              ? t('No {entity} found',{entity:customerDirectoryLabel.toLowerCase()})
              : t('No {entity} yet',{entity:customerDirectoryLabel.toLowerCase()})}
          </h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery 
              ? t('Try adjusting your search query')
              : t('Add your first {entity} to start tracking related actions',{entity:customerSingularLabel.toLowerCase()})
            }
          </p>
          {!searchQuery && canManageCustomers && (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t("Add {entity}",{entity:customerSingularLabel})}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map((customer) => (
            <Card key={customer.id} className={'p-4 hover:shadow-md transition-all duration-200 '+(requestedCustomer===customer.id?'border-primary ring-1 ring-primary/30':'')}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{customer.name}</h3>
                    {customer.taskStats && (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {customer.taskStats.total} {t("tasks")}
                        </Badge>
                        {customer.taskStats.completed > 0 && (
                          <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {customer.taskStats.completed} {t("done")}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {canManageCustomers && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingCustomer(customer)}><AppT text="Edit"/></DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setDeletingCustomer(customer)}
                      ><AppT text="Delete"/></DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Contact Info */}
              <div className="space-y-2 text-sm text-muted-foreground">
                {customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{customer.address}</span>
                  </div>
                )}
              </div>

              {customer.notes && (
                <p className="mt-3 text-xs text-muted-foreground line-clamp-2 border-t pt-3">
                  {customer.notes}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateCustomerModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <EditCustomerModal
        customer={editingCustomer}
        open={!!editingCustomer}
        onClose={() => setEditingCustomer(null)}
      />

      <DeleteCustomerModal
        customer={deletingCustomer}
        open={!!deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
      />
    </div>
  );
}
