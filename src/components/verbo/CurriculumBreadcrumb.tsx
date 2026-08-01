import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface CrumbItem {
  label: string;
  /** Route to navigate to (root crumbs such as "Dashboard"). */
  to?: string;
  /** In-page navigation back to a previous depth. */
  onClick?: () => void;
}

/**
 * Shared breadcrumb for the 3-level curriculum screens (Learning Path for
 * students, Performance Sessions preview for teachers). The last item is
 * always rendered as the current page.
 */
export function CurriculumBreadcrumb({ items, className }: { items: CrumbItem[]; className?: string }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="text-xs sm:text-xs">
        {visible.map((item, i) => {
          const isLast = i === visible.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-semibold">{item.label}</BreadcrumbPage>
                ) : item.to ? (
                  <BreadcrumbLink asChild>
                    <Link to={item.to} className="cursor-pointer">{item.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink asChild>
                    <button type="button" onClick={item.onClick} className="cursor-pointer">
                      {item.label}
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
